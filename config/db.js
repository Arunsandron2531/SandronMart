const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const dataDir = path.join(__dirname, '..', 'data');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// DB_PATH lets the deployment point SQLite at a persistent location (e.g. a
// Render Mounted Disk). Local development uses ./data/sandronmart.db.
const dbPath = process.env.DB_PATH || path.join(dataDir, 'sandronmart.db');
if (path.dirname(dbPath) !== dataDir && !fs.existsSync(path.dirname(dbPath))) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name     TEXT    NOT NULL,
    email         TEXT    NOT NULL UNIQUE,
    phone         TEXT    NOT NULL,
    password_hash TEXT    NOT NULL,
    role          TEXT    NOT NULL CHECK (role IN ('BUYER', 'SELLER', 'ADMIN')),
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  );
`);

// Databases created before the admin role existed baked the CHECK constraint as
// role IN ('BUYER','SELLER'). Rebuild the users table there so the role column
// accepts 'ADMIN' too. Existing rows keep their ids (so products/carts/orders
// stay linked) and no data is lost.
const usersDdl = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'").get();
if (usersDdl && /CHECK\s*\(role/.test(usersDdl.sql) && !/'ADMIN'/.test(usersDdl.sql)) {
  db.pragma('foreign_keys = OFF');
  db.exec(`
    CREATE TABLE users_new (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name     TEXT    NOT NULL,
      email         TEXT    NOT NULL UNIQUE,
      phone         TEXT    NOT NULL,
      password_hash TEXT    NOT NULL,
      role          TEXT    NOT NULL CHECK (role IN ('BUYER', 'SELLER', 'ADMIN')),
      created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);
  db.prepare(
    `INSERT INTO users_new (id, full_name, email, phone, password_hash, role, created_at)
     SELECT id, full_name, email, phone, password_hash, role, created_at FROM users`
  ).run();
  db.exec('DROP TABLE users;');
  db.exec('ALTER TABLE users_new RENAME TO users;');
  db.pragma('foreign_keys = ON');
}

db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    seller_id   INTEGER NOT NULL REFERENCES users(id),
    name        TEXT    NOT NULL,
    description TEXT    NOT NULL,
    category    TEXT    NOT NULL,
    price       REAL    NOT NULL,
    stock       INTEGER NOT NULL,
    image_url   TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );
`);

db.exec('CREATE INDEX IF NOT EXISTS idx_products_seller_id ON products(seller_id);');

db.exec(`
  CREATE TABLE IF NOT EXISTS cart_items (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    buyer_id   INTEGER NOT NULL REFERENCES users(id),
    product_id INTEGER NOT NULL REFERENCES products(id),
    quantity   INTEGER NOT NULL CHECK (quantity >= 1),
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE (buyer_id, product_id)
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS addresses (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    buyer_id     INTEGER NOT NULL REFERENCES users(id),
    full_name    TEXT    NOT NULL,
    phone        TEXT    NOT NULL,
    house_number TEXT    NOT NULL,
    street       TEXT    NOT NULL,
    landmark     TEXT,
    city         TEXT    NOT NULL,
    district     TEXT,
    state        TEXT    NOT NULL,
    pincode      TEXT    NOT NULL,
    is_default   INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
  );
`);

db.exec('CREATE INDEX IF NOT EXISTS idx_addresses_buyer_id ON addresses(buyer_id);');

db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number        TEXT    NOT NULL UNIQUE,
    buyer_id            INTEGER NOT NULL REFERENCES users(id),
    subtotal            REAL    NOT NULL,
    delivery_charge     REAL    NOT NULL DEFAULT 0,
    total               REAL    NOT NULL,
    full_name           TEXT    NOT NULL,
    phone               TEXT    NOT NULL,
    house_number        TEXT    NOT NULL,
    street              TEXT    NOT NULL,
    landmark            TEXT,
    city                TEXT    NOT NULL,
    district            TEXT,
    state               TEXT    NOT NULL,
    pincode             TEXT    NOT NULL,
    delivery_start_date TEXT    NOT NULL,
    delivery_end_date   TEXT    NOT NULL,
    delivery_time_slot  TEXT    NOT NULL,
    payment_method      TEXT    NOT NULL,
    payment_status      TEXT    NOT NULL DEFAULT 'PENDING',
    status              TEXT    NOT NULL DEFAULT 'PLACED',
    created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT    NOT NULL DEFAULT (datetime('now'))
  );
`);

db.exec('CREATE INDEX IF NOT EXISTS idx_orders_buyer_id ON orders(buyer_id);');

db.exec(`
  CREATE TABLE IF NOT EXISTS order_items (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id   INTEGER NOT NULL REFERENCES orders(id),
    product_id INTEGER REFERENCES products(id),
    seller_id  INTEGER REFERENCES users(id),
    name       TEXT    NOT NULL,
    price      REAL    NOT NULL,
    quantity   INTEGER NOT NULL CHECK (quantity >= 1),
    image_url  TEXT,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );
`);

db.exec('CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);');
db.exec('CREATE INDEX IF NOT EXISTS idx_order_items_seller_id ON order_items(seller_id);');

db.exec(`
  CREATE TABLE IF NOT EXISTS order_status_events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id   INTEGER NOT NULL REFERENCES orders(id),
    status     TEXT    NOT NULL,
    note       TEXT,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );
`);

db.exec('CREATE INDEX IF NOT EXISTS idx_order_status_events_order_id ON order_status_events(order_id);');

if (process.env.NODE_ENV !== 'test') {
  require('./seed')(db);
}

require('./admin-seed').ensureAdminUser(db);

db.pragma('wal_checkpoint(TRUNCATE)');

module.exports = db;