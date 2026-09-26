package com.sellix.laundry;

import android.Manifest;
import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothClass;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothSocket;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.location.LocationManager;
import android.os.Build;
import android.util.Base64;

import androidx.activity.result.ActivityResult;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.IOException;
import java.io.OutputStream;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;

/**
 * Bluetooth (classic SPP) ESC/POS receipt printers: POS-5890 / POS-58xx, Xprinter, Goojprt, MTP, etc.
 *
 * - listPaired / discover: paired devices and nearby ones, with a "looks like a printer" hint.
 * - pair: bonds a printer, entering the usual 0000 / 1234 PIN automatically.
 * - connect / print: keeps one connection open and reuses it (prints start instantly), reconnecting
 *   by itself when the printer was switched off or walked out of range. Idle connections close after
 *   a few minutes so the printer can sleep.
 * - Turns Bluetooth on (system prompt) when it is off.
 */
@CapacitorPlugin(
    name = "ThermalPrinter",
    permissions = {
        @Permission(alias = "bluetooth", strings = { Manifest.permission.BLUETOOTH_CONNECT, Manifest.permission.BLUETOOTH_SCAN }),
        @Permission(alias = "location", strings = { Manifest.permission.ACCESS_FINE_LOCATION })
    }
)
public class ThermalPrinterPlugin extends Plugin {

    private static final UUID SPP = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    /** Names cheap thermal printers advertise; many report an "uncategorized" Bluetooth class instead of Imaging. */
    private static final Pattern PRINTER_NAME = Pattern.compile(
        "(?i).*(print|pos[-_ ]?\\d|pos58|pos80|58\\d\\d|80\\d\\d|mpt|mtp|rpp|xp-|ptp|pt-2|zj-|goojprt|bluetooth p|thermal|receipt|hprt|bixolon|epson|tm-|star|sunmi|inner|milestone|cashino|rongta|munbyn|netum|gprinter|peripage).*");
    private static final int CHUNK = 256;
    private static final long CHUNK_PAUSE_MS = 15;
    private static final long IDLE_CLOSE_MIN = 3;
    private static final String[] PINS = { "0000", "1234" };

    /** All socket work runs here, one job at a time, so two prints never interleave. */
    private final ScheduledExecutorService io = Executors.newSingleThreadScheduledExecutor();
    private BluetoothSocket socket;
    private String socketAddress;
    private ScheduledFuture<?> idleClose;
    private BroadcastReceiver aclReceiver;

    @Override
    public void load() {
        // Drop the cached connection as soon as Android reports the printer went away.
        aclReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context c, Intent i) {
                BluetoothDevice d = i.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
                if (d != null && d.getAddress().equals(socketAddress)) io.execute(() -> closeSocket());
            }
        };
        IntentFilter f = new IntentFilter(BluetoothDevice.ACTION_ACL_DISCONNECTED);
        f.addAction(BluetoothAdapter.ACTION_STATE_CHANGED);
        ContextCompat.registerReceiver(getContext(), aclReceiver, f, ContextCompat.RECEIVER_EXPORTED);
    }

    @Override
    protected void handleOnDestroy() {
        try { getContext().unregisterReceiver(aclReceiver); } catch (Exception ignored) { }
        io.execute(this::closeSocket);
        io.shutdown();
    }

    // ---------- permissions & Bluetooth on ----------

    private static boolean isS() { return Build.VERSION.SDK_INT >= Build.VERSION_CODES.S; }

    /** BLUETOOTH_CONNECT/SCAN are runtime permissions only on Android 12+; older versions grant them at install. */
    private boolean missingBluetooth() { return isS() && getPermissionState("bluetooth") != PermissionState.GRANTED; }

    /** Before Android 12, finding nearby devices needs location permission. */
    private boolean missingScan() {
        return isS() ? missingBluetooth() : getPermissionState("location") != PermissionState.GRANTED;
    }

    private BluetoothAdapter adapter() {
        BluetoothManager m = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        return m == null ? null : m.getAdapter();
    }

    /**
     * Common gate for every method: permissions, then Bluetooth on. Returns the adapter when the method
     * can go ahead; otherwise the call is continued later (after a prompt) or rejected.
     * `silent` calls (background auto-connect) never show prompts.
     */
    private BluetoothAdapter ready(PluginCall call, boolean scan) {
        boolean silent = call.getBoolean("silent", false);
        boolean missing = scan ? missingScan() : missingBluetooth();
        if (missing) {
            if (silent) { call.reject("Bluetooth permission not granted yet.", "NO_PERMISSION"); return null; }
            requestPermissionForAlias(isS() || !scan ? "bluetooth" : "location", call, "permCallback");
            return null;
        }
        BluetoothAdapter a = adapter();
        if (a == null) { call.reject("This device has no Bluetooth.", "NO_BLUETOOTH"); return null; }
        if (!a.isEnabled()) {
            if (silent) { call.reject("Bluetooth is off.", "BLUETOOTH_OFF"); return null; }
            try {
                startActivityForResult(call, new Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE), "enableCallback");
            } catch (Exception e) {
                call.reject("Bluetooth is off. Turn it on and try again.", "BLUETOOTH_OFF");
            }
            return null;
        }
        return a;
    }

    @PermissionCallback
    private void permCallback(PluginCall call) {
        boolean scan = "discover".equals(call.getMethodName());
        if (scan ? missingScan() : missingBluetooth()) {
            call.reject("Bluetooth permission is required to use the receipt printer. Allow \"Nearby devices\" for this app in Android settings.", "NO_PERMISSION");
            return;
        }
        rerun(call);
    }

    @ActivityCallback
    private void enableCallback(PluginCall call, ActivityResult result) {
        BluetoothAdapter a = adapter();
        if (a == null || !a.isEnabled()) { call.reject("Bluetooth is off. Turn it on to print receipts.", "BLUETOOTH_OFF"); return; }
        rerun(call);
    }

    private void rerun(PluginCall call) {
        switch (call.getMethodName()) {
            case "print": print(call); break;
            case "connect": connect(call); break;
            case "discover": discover(call); break;
            case "pair": pair(call); break;
            default: listPaired(call);
        }
    }

    // ---------- device lists ----------

    @SuppressLint("MissingPermission")
    private JSObject describe(BluetoothDevice d, String fallbackName) {
        String name = d.getName();
        if (name == null || name.isEmpty()) name = fallbackName;
        BluetoothClass c = d.getBluetoothClass();
        boolean imaging = c != null && c.getMajorDeviceClass() == BluetoothClass.Device.Major.IMAGING;
        JSObject o = new JSObject();
        o.put("name", name == null || name.isEmpty() ? d.getAddress() : name);
        o.put("address", d.getAddress());
        o.put("isPrinter", imaging || (name != null && PRINTER_NAME.matcher(name).matches()));
        o.put("paired", d.getBondState() == BluetoothDevice.BOND_BONDED);
        return o;
    }

    @SuppressLint("MissingPermission")
    @PluginMethod
    public void listPaired(PluginCall call) {
        BluetoothAdapter a = ready(call, false);
        if (a == null) return;
        JSArray list = new JSArray();
        for (BluetoothDevice d : a.getBondedDevices()) list.put(describe(d, null));
        JSObject ret = new JSObject();
        ret.put("devices", list);
        call.resolve(ret);
    }

    /** Scans for nearby Bluetooth devices (about 12 s) so a new printer can be paired from inside the app. */
    @SuppressLint("MissingPermission")
    @PluginMethod
    public void discover(PluginCall call) {
        BluetoothAdapter a = ready(call, true);
        if (a == null) return;
        if (!isS() && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            LocationManager lm = (LocationManager) getContext().getSystemService(Context.LOCATION_SERVICE);
            if (lm != null && !lm.isLocationEnabled()) {
                call.reject("Turn on Location to search for printers (Android needs it for Bluetooth scanning on this phone).", "LOCATION_OFF");
                return;
            }
        }
        final Map<String, JSObject> found = new LinkedHashMap<>();
        final boolean[] done = { false };
        final BroadcastReceiver[] holder = new BroadcastReceiver[1];
        final Runnable finish = () -> {
            synchronized (done) {
                if (done[0]) return;
                done[0] = true;
            }
            try { getContext().unregisterReceiver(holder[0]); } catch (Exception ignored) { }
            try { a.cancelDiscovery(); } catch (Exception ignored) { }
            JSArray list = new JSArray();
            synchronized (found) { for (JSObject o : found.values()) list.put(o); }
            JSObject ret = new JSObject();
            ret.put("devices", list);
            call.resolve(ret);
        };
        holder[0] = new BroadcastReceiver() {
            @Override
            public void onReceive(Context c, Intent i) {
                if (BluetoothAdapter.ACTION_DISCOVERY_FINISHED.equals(i.getAction())) { finish.run(); return; }
                BluetoothDevice d = i.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
                if (d == null) return;
                JSObject o = describe(d, i.getStringExtra(BluetoothDevice.EXTRA_NAME));
                synchronized (found) { found.put(d.getAddress(), o); }
            }
        };
        IntentFilter f = new IntentFilter(BluetoothDevice.ACTION_FOUND);
        f.addAction(BluetoothAdapter.ACTION_DISCOVERY_FINISHED);
        ContextCompat.registerReceiver(getContext(), holder[0], f, ContextCompat.RECEIVER_EXPORTED);
        if (a.isDiscovering()) a.cancelDiscovery();
        if (!a.startDiscovery()) {
            finish.run();
            return;
        }
        int timeout = call.getInt("timeout", 12000);
        io.schedule(finish, timeout, TimeUnit.MILLISECONDS);
    }

    /** Pairs with a printer, typing the common 0000 then 1234 PIN so staff never see a PIN prompt. */
    @SuppressLint("MissingPermission")
    @PluginMethod
    public void pair(PluginCall call) {
        BluetoothAdapter a = ready(call, false);
        if (a == null) return;
        String address = call.getString("address");
        if (address == null) { call.reject("Missing printer address."); return; }
        final BluetoothDevice device;
        try { device = a.getRemoteDevice(address); } catch (IllegalArgumentException e) { call.reject("Invalid printer address."); return; }
        if (device.getBondState() == BluetoothDevice.BOND_BONDED) { call.resolve(); return; }
        try { a.cancelDiscovery(); } catch (Exception ignored) { }

        final int[] pinIndex = { 0 };
        final boolean[] done = { false };
        final BroadcastReceiver[] holder = new BroadcastReceiver[1];
        final ScheduledFuture<?>[] timeout = new ScheduledFuture<?>[1];
        final java.util.function.Consumer<String> end = (error) -> {
            synchronized (done) {
                if (done[0]) return;
                done[0] = true;
            }
            try { getContext().unregisterReceiver(holder[0]); } catch (Exception ignored) { }
            if (timeout[0] != null) timeout[0].cancel(false);
            if (error == null) call.resolve(); else call.reject(error, "PAIR_FAILED");
        };
        holder[0] = new BroadcastReceiver() {
            @Override
            public void onReceive(Context c, Intent i) {
                BluetoothDevice d = i.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
                if (d == null || !d.getAddress().equals(address)) return;
                if (BluetoothDevice.ACTION_PAIRING_REQUEST.equals(i.getAction())) {
                    int variant = i.getIntExtra(BluetoothDevice.EXTRA_PAIRING_VARIANT, -1);
                    if (variant == BluetoothDevice.PAIRING_VARIANT_PIN) {
                        try {
                            if (d.setPin(PINS[Math.min(pinIndex[0], PINS.length - 1)].getBytes()) && isOrderedBroadcast()) abortBroadcast();
                        } catch (Exception ignored) { /* the system PIN dialog stays up instead */ }
                    }
                    return;
                }
                int state = i.getIntExtra(BluetoothDevice.EXTRA_BOND_STATE, BluetoothDevice.ERROR);
                int prev = i.getIntExtra(BluetoothDevice.EXTRA_PREVIOUS_BOND_STATE, BluetoothDevice.ERROR);
                if (state == BluetoothDevice.BOND_BONDED) end.accept(null);
                else if (state == BluetoothDevice.BOND_NONE && prev == BluetoothDevice.BOND_BONDING) {
                    // Wrong PIN (or the prompt was dismissed): try the next common PIN once.
                    if (++pinIndex[0] < PINS.length && d.createBond()) return;
                    end.accept("Could not pair with the printer. Check that it is on, then try again (PIN 0000 or 1234).");
                }
            }
        };
        IntentFilter f = new IntentFilter(BluetoothDevice.ACTION_BOND_STATE_CHANGED);
        f.addAction(BluetoothDevice.ACTION_PAIRING_REQUEST);
        f.setPriority(IntentFilter.SYSTEM_HIGH_PRIORITY - 1);
        ContextCompat.registerReceiver(getContext(), holder[0], f, ContextCompat.RECEIVER_EXPORTED);
        timeout[0] = io.schedule(() -> end.accept("Pairing timed out. Make sure the printer is on and close by."), 45, TimeUnit.SECONDS);
        if (!device.createBond()) end.accept("Could not start pairing with the printer.");
    }

    // ---------- connection ----------

    /** Tries the connection styles cheap printers accept: secure SPP, insecure SPP, then raw RFCOMM channel 1. */
    @SuppressLint("MissingPermission")
    private BluetoothSocket open(BluetoothAdapter a, String address) throws Exception {
        try { a.cancelDiscovery(); } catch (Exception ignored) { } // discovery slows or breaks connections
        BluetoothDevice device = a.getRemoteDevice(address);
        Exception last = null;
        for (int attempt = 0; attempt < 2; attempt++) {
            for (int style = 0; style < 3; style++) {
                BluetoothSocket s = null;
                try {
                    if (style == 0) s = device.createRfcommSocketToServiceRecord(SPP);
                    else if (style == 1) s = device.createInsecureRfcommSocketToServiceRecord(SPP);
                    else s = (BluetoothSocket) device.getClass().getMethod("createRfcommSocket", int.class).invoke(device, 1);
                    s.connect();
                    return s;
                } catch (Exception e) {
                    last = e;
                    closeQuietly(s);
                }
            }
            Thread.sleep(500); // printer may still be waking up
        }
        throw last == null ? new IOException("connect failed") : last;
    }

    /** Must run on `io`. Reuses the open connection to the same printer, or opens a new one. */
    private OutputStream stream(BluetoothAdapter a, String address, boolean fresh) throws Exception {
        if (fresh || socket == null || !socket.isConnected() || !address.equals(socketAddress)) {
            closeSocket();
            socket = open(a, address);
            socketAddress = address;
        }
        return socket.getOutputStream();
    }

    private void touch() {
        if (idleClose != null) idleClose.cancel(false);
        idleClose = io.schedule(this::closeSocket, IDLE_CLOSE_MIN, TimeUnit.MINUTES);
    }

    private void closeSocket() {
        closeQuietly(socket);
        socket = null;
        socketAddress = null;
    }

    private static String friendly(Exception e) {
        return "Could not reach the printer. Make sure it is turned on, has paper, and is within a few meters. (" + e.getMessage() + ")";
    }

    /** Opens (or keeps) the connection ahead of time so the next receipt prints immediately. */
    @PluginMethod
    public void connect(PluginCall call) {
        BluetoothAdapter a = ready(call, false);
        if (a == null) return;
        String address = call.getString("address");
        if (address == null) { call.reject("Missing printer address."); return; }
        io.execute(() -> {
            try {
                stream(a, address, false);
                touch();
                call.resolve();
            } catch (Exception e) {
                closeSocket();
                call.reject(friendly(e), "CONNECT_FAILED");
            }
        });
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        io.execute(() -> { closeSocket(); call.resolve(); });
    }

    @PluginMethod
    public void status(PluginCall call) {
        io.execute(() -> {
            JSObject ret = new JSObject();
            boolean on = socket != null && socket.isConnected();
            ret.put("connected", on);
            ret.put("address", on ? socketAddress : null);
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void print(PluginCall call) {
        BluetoothAdapter a = ready(call, false);
        if (a == null) return;
        String address = call.getString("address");
        String data = call.getString("data");
        if (address == null || data == null) { call.reject("Missing printer address or data."); return; }
        final byte[] bytes = Base64.decode(data, Base64.DEFAULT);
        io.execute(() -> {
            try {
                try {
                    write(stream(a, address, false), bytes);
                } catch (IOException stale) {
                    // The kept connection died (printer restarted, out of range): reconnect once and resend.
                    write(stream(a, address, true), bytes);
                }
                touch();
                call.resolve();
            } catch (Exception e) {
                closeSocket();
                call.reject(friendly(e), "PRINT_FAILED");
            }
        });
    }

    /** Small chunks with short pauses keep 58 mm printers' tiny receive buffers from overflowing (garbled logos). */
    private static void write(OutputStream out, byte[] bytes) throws IOException, InterruptedException {
        for (int i = 0; i < bytes.length; i += CHUNK) {
            out.write(bytes, i, Math.min(CHUNK, bytes.length - i));
            out.flush();
            Thread.sleep(CHUNK_PAUSE_MS);
        }
    }

    private static void closeQuietly(BluetoothSocket s) {
        if (s == null) return;
        try { s.close(); } catch (IOException ignored) { }
    }
}
