// Ordered, append-only. Never edit a released migration; add a new one.
// Money is stored as integer centavos. Timestamps are ISO-8601 UTC text.
export const migrations: string[] = [
  `
  CREATE TABLE users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    full_name     TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    salt          TEXT NOT NULL,
    role          TEXT NOT NULL CHECK (role IN ('admin','manager','cashier')),
    active        INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE TABLE customers (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_code TEXT NOT NULL UNIQUE,
    full_name     TEXT NOT NULL,
    contact       TEXT NOT NULL DEFAULT '',
    address       TEXT NOT NULL DEFAULT '',
    notes         TEXT NOT NULL DEFAULT '',
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX idx_customers_name ON customers(full_name COLLATE NOCASE);
  CREATE INDEX idx_customers_contact ON customers(contact);

  CREATE TABLE services (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    name           TEXT NOT NULL UNIQUE COLLATE NOCASE,
    description    TEXT NOT NULL DEFAULT '',
    pricing_method TEXT NOT NULL CHECK (pricing_method IN ('per_kg','per_piece','fixed')),
    price_cents    INTEGER NOT NULL CHECK (price_cents >= 0),
    active         INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
    created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE TABLE orders (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number    TEXT NOT NULL UNIQUE,
    customer_id     INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    received_at     TEXT NOT NULL,
    expected_pickup TEXT,
    subtotal_cents  INTEGER NOT NULL CHECK (subtotal_cents >= 0),
    discount_cents  INTEGER NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
    total_cents     INTEGER NOT NULL CHECK (total_cents >= 0),
    paid_cents      INTEGER NOT NULL DEFAULT 0 CHECK (paid_cents >= 0),
    payment_status  TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','partial','paid')),
    status          TEXT NOT NULL DEFAULT 'received'
      CHECK (status IN ('received','washing','drying','folding','ready','released','cancelled')),
    notes           TEXT NOT NULL DEFAULT '',
    created_by      INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    CHECK (discount_cents <= subtotal_cents),
    CHECK (total_cents = subtotal_cents - discount_cents),
    CHECK (paid_cents <= total_cents)
  );
  CREATE INDEX idx_orders_customer ON orders(customer_id);
  CREATE INDEX idx_orders_status ON orders(status);
  CREATE INDEX idx_orders_payment_status ON orders(payment_status);
  CREATE INDEX idx_orders_received ON orders(received_at);

  CREATE TABLE order_items (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id         INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    service_id       INTEGER NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
    service_name     TEXT NOT NULL,
    pricing_method   TEXT NOT NULL CHECK (pricing_method IN ('per_kg','per_piece','fixed')),
    unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
    quantity         REAL NOT NULL CHECK (quantity > 0),
    amount_cents     INTEGER NOT NULL CHECK (amount_cents >= 0)
  );
  CREATE INDEX idx_order_items_order ON order_items(order_id);
  CREATE INDEX idx_order_items_service ON order_items(service_id);

  CREATE TABLE payments (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id     INTEGER NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    method       TEXT NOT NULL CHECK (method IN ('cash','gcash','other')),
    paid_at      TEXT NOT NULL,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    reference    TEXT NOT NULL DEFAULT '',
    created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX idx_payments_order ON payments(order_id);
  CREATE INDEX idx_payments_paid_at ON payments(paid_at);

  CREATE TABLE settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  INSERT INTO settings (key, value) VALUES
    ('business_name', 'Sellix Laundry'),
    ('business_address', ''),
    ('business_contact', ''),
    ('receipt_footer', 'Thank you!'),
    ('last_backup_at', '');
  `,
  // PIN login. PINs are PBKDF2-hashed like passwords; locked_until is epoch ms.
  `
  ALTER TABLE users ADD COLUMN pin_hash TEXT;
  ALTER TABLE users ADD COLUMN pin_salt TEXT;
  ALTER TABLE users ADD COLUMN pin_length INTEGER;
  ALTER TABLE users ADD COLUMN failed_attempts INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE users ADD COLUMN locked_until INTEGER NOT NULL DEFAULT 0;
  `,
  // Optional service photo, stored as a downscaled JPEG data URL.
  `
  ALTER TABLE services ADD COLUMN image TEXT;
  `,
  // Stored balance for Pay Later / partial payments; kept in sync with paid_cents by createOrder and addPayment.
  `
  ALTER TABLE orders ADD COLUMN balance_cents INTEGER NOT NULL DEFAULT 0;
  UPDATE orders SET balance_cents = total_cents - paid_cents;
  `,
  // Washers/dryers and which order is in each. "In Use" is derived from an open assignment (ended_at IS NULL);
  // the partial unique indexes stop two open orders sharing a machine and one order holding two machines.
  // Assignments snapshot the machine code so history survives a machine being deleted.
  `
  CREATE TABLE machines (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    code           TEXT NOT NULL UNIQUE COLLATE NOCASE,
    type           TEXT NOT NULL CHECK (type IN ('washer','dryer')),
    notes          TEXT NOT NULL DEFAULT '',
    out_of_service INTEGER NOT NULL DEFAULT 0 CHECK (out_of_service IN (0,1)),
    created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE TABLE machine_assignments (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    machine_id   INTEGER REFERENCES machines(id) ON DELETE SET NULL,
    machine_code TEXT NOT NULL,
    machine_type TEXT NOT NULL CHECK (machine_type IN ('washer','dryer')),
    order_id     INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    started_at   TEXT NOT NULL,
    ended_at     TEXT,
    end_reason   TEXT CHECK (end_reason IN ('finished','changed','status')),
    user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL
  );
  CREATE UNIQUE INDEX ux_assign_machine_open ON machine_assignments(machine_id) WHERE ended_at IS NULL;
  CREATE UNIQUE INDEX ux_assign_order_open ON machine_assignments(order_id) WHERE ended_at IS NULL;
  CREATE INDEX idx_assign_order ON machine_assignments(order_id);

  INSERT INTO machines (code, type) VALUES
    ('W01','washer'), ('W02','washer'), ('W03','washer'),
    ('D01','dryer'), ('D02','dryer');
  `,
  // Add-ons (detergent, fabric conditioner…) are services flagged is_addon; existing ones are recognised by name.
  // Folding is retired from the workflow; orders in it move on to Ready. ('released' is shown as Completed.)
  `
  ALTER TABLE services ADD COLUMN is_addon INTEGER NOT NULL DEFAULT 0 CHECK (is_addon IN (0,1));
  UPDATE services SET is_addon = 1
    WHERE name LIKE '%detergent%' OR name LIKE '%downy%' OR name LIKE '%conditioner%'
       OR name LIKE '%fabcon%' OR name LIKE '%softener%' OR name LIKE '%bleach%';
  UPDATE orders SET status = 'ready', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE status = 'folding';
  `,
  // Cash handed over for a cash payment (NULL for other methods and older payments). amount_cents stays the part
  // applied to the balance; change = tendered_cents - amount_cents and is never recorded as a payment.
  `
  ALTER TABLE payments ADD COLUMN tendered_cents INTEGER;
  `,
  // Laundry-shop pricing. pricing_type is what staff see (per load / kg / item / quantity / fixed); pricing_method stays
  // the calculation class (per_kg, per_piece = whole units, fixed) so existing checks, orders and reports keep working.
  // Packages bundle services and add-ons; plain services may include add-ons. Inclusion quantity is per load (or unit).
  // max_kg overrides the load_max_kg setting for one service. Order lines snapshot the type, weight, how much of the
  // quantity was included free in a package (never charged twice) and a short "includes" note for receipts.
  `
  ALTER TABLE services ADD COLUMN pricing_type TEXT NOT NULL DEFAULT 'per_item'
    CHECK (pricing_type IN ('per_load','per_kg','per_item','per_quantity','fixed'));
  ALTER TABLE services ADD COLUMN is_package INTEGER NOT NULL DEFAULT 0 CHECK (is_package IN (0,1));
  ALTER TABLE services ADD COLUMN max_kg REAL CHECK (max_kg IS NULL OR max_kg > 0);
  UPDATE services SET pricing_type = CASE
    WHEN pricing_method = 'per_kg' THEN 'per_kg'
    WHEN pricing_method = 'fixed' THEN 'fixed'
    WHEN is_addon = 1 THEN 'per_quantity'
    ELSE 'per_item' END;

  CREATE TABLE service_inclusions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    service_id  INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    included_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    quantity    REAL NOT NULL DEFAULT 1 CHECK (quantity > 0),
    UNIQUE (service_id, included_id),
    CHECK (service_id <> included_id)
  );
  CREATE INDEX idx_inclusions_included ON service_inclusions(included_id);

  ALTER TABLE order_items ADD COLUMN pricing_type TEXT;
  ALTER TABLE order_items ADD COLUMN weight_kg REAL;
  ALTER TABLE order_items ADD COLUMN included_qty REAL NOT NULL DEFAULT 0;
  ALTER TABLE order_items ADD COLUMN note TEXT NOT NULL DEFAULT '';

  INSERT OR IGNORE INTO settings (key, value) VALUES ('load_max_kg', '8');
  `,
  // Employee shifts. Shift status is separate from order/payment/machine status. Orders belong to the shift that created
  // them; payments to the shift that received the money (a Pay Later order paid next day counts in that day's shift).
  // Closing a shift freezes its totals in the row, so history never changes; orders are never touched.
  // The partial unique index allows only one active shift per employee. Older rows keep shift_id NULL.
  `
  CREATE TABLE shifts (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    user_name           TEXT NOT NULL,
    started_at          TEXT NOT NULL,
    ended_at            TEXT,
    status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed')),
    opening_cash_cents  INTEGER CHECK (opening_cash_cents IS NULL OR opening_cash_cents >= 0),
    orders_count        INTEGER,
    cash_cents          INTEGER,
    noncash_cents       INTEGER,
    expected_cash_cents INTEGER,
    actual_cash_cents   INTEGER CHECK (actual_cash_cents IS NULL OR actual_cash_cents >= 0),
    difference_cents    INTEGER,
    closed_by           INTEGER REFERENCES users(id) ON DELETE SET NULL,
    closed_by_name      TEXT,
    CHECK ((status = 'active') = (ended_at IS NULL))
  );
  CREATE UNIQUE INDEX ux_shift_user_active ON shifts(user_id) WHERE status = 'active';
  CREATE INDEX idx_shifts_started ON shifts(started_at);

  CREATE TABLE shift_events (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    shift_id  INTEGER NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
    user_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
    kind      TEXT NOT NULL CHECK (kind IN ('drawer_open','order_cancelled')),
    order_id  INTEGER REFERENCES orders(id) ON DELETE SET NULL,
    detail    TEXT NOT NULL DEFAULT '',
    at        TEXT NOT NULL
  );
  CREATE INDEX idx_shift_events_shift ON shift_events(shift_id);

  ALTER TABLE orders ADD COLUMN shift_id INTEGER REFERENCES shifts(id) ON DELETE SET NULL;
  ALTER TABLE payments ADD COLUMN shift_id INTEGER REFERENCES shifts(id) ON DELETE SET NULL;
  CREATE INDEX idx_orders_shift ON orders(shift_id);
  CREATE INDEX idx_payments_shift ON payments(shift_id);
  `,
  // Pickup: who released the laundry to the customer, when, and in which shift. Set once by Release Laundry
  // (orders.status = 'released'); older completed orders keep NULLs.
  `
  ALTER TABLE orders ADD COLUMN released_at TEXT;
  ALTER TABLE orders ADD COLUMN released_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
  ALTER TABLE orders ADD COLUMN released_shift_id INTEGER REFERENCES shifts(id) ON DELETE SET NULL;
  `,
  // Attendance and the store/cash shift are separated. One shared device and drawer: `shifts` now holds the daily store
  // shift (user_id/user_name = who opened it, closed_by = who closed it) and only ONE may be open at a time.
  // Employees clock in and out in `attendance` (one open record each); timing out never touches the store shift.
  // Hours worked are derived from time_in/time_out. Every older per-employee shift is carried over as an attendance
  // record. If several old shifts are still open, the newest stays open as the store shift and the others are closed
  // with their totals frozen (actual cash left uncounted), so no payment moves between shifts.
  `
  CREATE TABLE attendance (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    user_name TEXT NOT NULL,
    time_in   TEXT NOT NULL,
    time_out  TEXT,
    CHECK (time_out IS NULL OR time_out >= time_in)
  );
  CREATE UNIQUE INDEX ux_attendance_open ON attendance(user_id) WHERE time_out IS NULL;
  CREATE INDEX idx_attendance_in ON attendance(time_in);
  INSERT INTO attendance (user_id, user_name, time_in, time_out)
    SELECT user_id, user_name, started_at, ended_at FROM shifts ORDER BY started_at;

  UPDATE shifts SET
    status = 'closed',
    ended_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
    orders_count = (SELECT COUNT(*) FROM orders o WHERE o.shift_id = shifts.id),
    cash_cents = (SELECT COALESCE(SUM(amount_cents),0) FROM payments p WHERE p.shift_id = shifts.id AND p.method = 'cash'),
    noncash_cents = (SELECT COALESCE(SUM(amount_cents),0) FROM payments p WHERE p.shift_id = shifts.id AND p.method <> 'cash'),
    expected_cash_cents = COALESCE(opening_cash_cents,0)
      + (SELECT COALESCE(SUM(amount_cents),0) FROM payments p WHERE p.shift_id = shifts.id AND p.method = 'cash'),
    closed_by_name = 'System (store shift update)'
  WHERE status = 'active' AND id <> (SELECT MAX(id) FROM shifts WHERE status = 'active');

  DROP INDEX ux_shift_user_active;
  CREATE UNIQUE INDEX ux_shift_store_open ON shifts(status) WHERE status = 'active';
  `,
  // Refunds of money received on cancelled orders. Payments are never edited or deleted: a refund is its own row,
  // counted in the store shift that is open when the money goes back (a cash refund leaves that shift's drawer).
  // orders.refunded_cents is kept in sync by refundOrder, like paid_cents by addPayment. shifts.cash_out_cents
  // freezes a closed shift's cash refunds next to its other totals.
  `
  CREATE TABLE refunds (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id     INTEGER NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    method       TEXT NOT NULL CHECK (method IN ('cash','gcash','other')),
    reason       TEXT NOT NULL DEFAULT '',
    refunded_at  TEXT NOT NULL,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    shift_id     INTEGER REFERENCES shifts(id) ON DELETE SET NULL
  );
  CREATE INDEX idx_refunds_order ON refunds(order_id);
  CREATE INDEX idx_refunds_shift ON refunds(shift_id);
  CREATE INDEX idx_refunds_at ON refunds(refunded_at);

  ALTER TABLE orders ADD COLUMN refunded_cents INTEGER NOT NULL DEFAULT 0 CHECK (refunded_cents >= 0 AND refunded_cents <= paid_cents);
  ALTER TABLE shifts ADD COLUMN cash_out_cents INTEGER;
  `,
  // Optional name/phone for a walk-in order, kept on the order itself (walk-ins were filed under the shared WALK-IN
  // customer). Walk-in has since been removed and new orders never set these; kept so older walk-in orders show them.
  `
  ALTER TABLE orders ADD COLUMN guest_name TEXT NOT NULL DEFAULT '';
  ALTER TABLE orders ADD COLUMN guest_contact TEXT NOT NULL DEFAULT '';
  `,
  // Preset machine timers. Each machine has its own cycle length; starting a machine snapshots it on the assignment
  // with the expected end time, so the countdown is always expected_end_at - now (accurate across navigation,
  // backgrounding and restarts) and editing a machine later never changes a running cycle. A machine is Done while its
  // assignment is still open past expected_end_at; staff free it with Mark as Unloaded. Loads already running get a
  // timer from their start time; older finished assignments keep NULLs.
  `
  ALTER TABLE machines ADD COLUMN cycle_minutes INTEGER NOT NULL DEFAULT 40 CHECK (cycle_minutes BETWEEN 1 AND 600);
  UPDATE machines SET cycle_minutes = 38 WHERE type = 'washer';
  ALTER TABLE machine_assignments ADD COLUMN duration_minutes INTEGER CHECK (duration_minutes IS NULL OR duration_minutes > 0);
  ALTER TABLE machine_assignments ADD COLUMN expected_end_at TEXT;
  UPDATE machine_assignments SET
    duration_minutes = (SELECT m.cycle_minutes FROM machines m WHERE m.id = machine_assignments.machine_id),
    expected_end_at = strftime('%Y-%m-%dT%H:%M:%fZ', started_at,
      '+' || (SELECT m.cycle_minutes FROM machines m WHERE m.id = machine_assignments.machine_id) || ' minutes')
  WHERE ended_at IS NULL AND machine_id IS NOT NULL;
  `,
  // Machine timers retired: the washers and dryers have their own, so staff tap Washing Done / Drying Done instead of
  // waiting on an in-app countdown. A machine is In Use exactly while its assignment is open. Each order keeps when each
  // stage started and finished (and who started it) for history and reports; durations are completed_at - started_at.
  // Order status stays received → washing → drying → ready → released: "Washing Done" is washing with
  // washing_completed_at set. Backfilled from machine history. cycle_minutes / duration_minutes / expected_end_at are
  // no longer written or read; they stay only so older rows and backups keep loading.
  `
  ALTER TABLE orders ADD COLUMN washing_started_at TEXT;
  ALTER TABLE orders ADD COLUMN washing_started_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
  ALTER TABLE orders ADD COLUMN washing_completed_at TEXT;
  ALTER TABLE orders ADD COLUMN drying_started_at TEXT;
  ALTER TABLE orders ADD COLUMN drying_started_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
  ALTER TABLE orders ADD COLUMN drying_completed_at TEXT;

  UPDATE orders SET
    washing_started_at = (SELECT a.started_at FROM machine_assignments a WHERE a.order_id = orders.id AND a.machine_type = 'washer' ORDER BY a.started_at, a.id LIMIT 1),
    washing_started_by = (SELECT a.user_id FROM machine_assignments a WHERE a.order_id = orders.id AND a.machine_type = 'washer' ORDER BY a.started_at, a.id LIMIT 1),
    drying_started_at = (SELECT a.started_at FROM machine_assignments a WHERE a.order_id = orders.id AND a.machine_type = 'dryer' ORDER BY a.started_at, a.id LIMIT 1),
    drying_started_by = (SELECT a.user_id FROM machine_assignments a WHERE a.order_id = orders.id AND a.machine_type = 'dryer' ORDER BY a.started_at, a.id LIMIT 1);
  UPDATE orders SET washing_completed_at =
    (SELECT MAX(a.ended_at) FROM machine_assignments a WHERE a.order_id = orders.id AND a.machine_type = 'washer')
  WHERE washing_started_at IS NOT NULL AND status IN ('washing','drying','ready','released') AND NOT EXISTS
    (SELECT 1 FROM machine_assignments a WHERE a.order_id = orders.id AND a.machine_type = 'washer' AND a.ended_at IS NULL);
  UPDATE orders SET drying_completed_at =
    (SELECT MAX(a.ended_at) FROM machine_assignments a WHERE a.order_id = orders.id AND a.machine_type = 'dryer')
  WHERE drying_started_at IS NOT NULL AND status IN ('ready','released') AND NOT EXISTS
    (SELECT 1 FROM machine_assignments a WHERE a.order_id = orders.id AND a.machine_type = 'dryer' AND a.ended_at IS NULL);
  `,
  // Machine queues. Who tapped Washing Done / Drying Done, next to who started each stage (unknown for older orders).
  // The washing and drying queues are not stored: an order is queued exactly while it waits for a machine (Received with
  // no washer; washing finished with no dryer), ordered by when it became ready (received_at / washing_completed_at).
  // Deriving them means an order can never be queued twice or left queued after it moves on or is cancelled.
  `
  ALTER TABLE orders ADD COLUMN washing_completed_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
  ALTER TABLE orders ADD COLUMN drying_completed_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
  CREATE INDEX idx_orders_washed ON orders(washing_completed_at);
  `,
  // Machine and stage tracking retired: staff run the washers, dryers and folding by hand, and the app keeps only the
  // overall status Received → Processing → Ready for Pickup → Completed (or Cancelled). Processing is stored as
  // 'washing': the orders.status CHECK constraint predates it, and rebuilding the orders table on customer devices
  // (foreign keys on, cascading order_items) isn't worth the risk. Orders in Drying join Processing.
  // processing_at/by and ready_at/by record when each step was tapped and by whom, backfilled from the old stage times.
  // machines, machine_assignments and the washing_* / drying_* columns are no longer read or written; they stay so
  // older rows and backups keep loading. Any machine still marked In Use is released.
  `
  ALTER TABLE orders ADD COLUMN processing_at TEXT;
  ALTER TABLE orders ADD COLUMN processing_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
  ALTER TABLE orders ADD COLUMN ready_at TEXT;
  ALTER TABLE orders ADD COLUMN ready_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

  UPDATE orders SET
    processing_at = COALESCE(washing_started_at, drying_started_at),
    processing_by = COALESCE(washing_started_by, drying_started_by);
  UPDATE orders SET
    ready_at = COALESCE(drying_completed_at, washing_completed_at),
    ready_by = COALESCE(drying_completed_by, washing_completed_by)
  WHERE status IN ('ready','released');
  UPDATE orders SET status = 'washing', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE status = 'drying';

  UPDATE machine_assignments SET ended_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), end_reason = 'status' WHERE ended_at IS NULL;
  `,
  // My Account profile photo: a path in the app's private data folder (lib/avatarPhoto.ts), never the image itself.
  // NULL = no photo; the avatar shows initials.
  `
  ALTER TABLE users ADD COLUMN photo TEXT;
  `,
]
