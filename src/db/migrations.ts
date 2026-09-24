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
]
