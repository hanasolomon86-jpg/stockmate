const Database = require('better-sqlite3')
const fs = require('node:fs')
const path = require('node:path')

// Create a folder for the database file if it does not exist.
const dataDirectory = path.join(__dirname, 'data')
fs.mkdirSync(dataDirectory, { recursive: true })

// Open the SQLite database.
const databasePath =
  process.env.STOCKMATE_DB_PATH || path.join(dataDirectory, 'stockmate.db')
const db = new Database(databasePath)

// Enforce foreign key constraints.
db.pragma('foreign_keys = ON')

// Create the products table if it does not exist.
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    unit TEXT NOT NULL,
    sale_price REAL NOT NULL CHECK (sale_price >= 0),
    min_stock INTEGER NOT NULL CHECK (min_stock >= 0),
    target_stock INTEGER NOT NULL CHECK (target_stock >= min_stock),
    barcode TEXT UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`)

// Create the categories table.
db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`)

// Store supplier details.
db.exec(`
  CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    contact_name TEXT,
    phone TEXT,
    email TEXT,
    notes TEXT,
    is_active INTEGER NOT NULL DEFAULT 1
      CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`)

// Store purchase orders and their workflow status.
db.exec(`
  CREATE TABLE IF NOT EXISTS purchase_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER NOT NULL
      REFERENCES suppliers(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'draft'
      CHECK (
        status IN (
          'draft',
          'ordered',
          'partially_received',
          'received',
          'cancelled'
        )
      ),
    notes TEXT,
    ordered_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`)

// Store products and quantities belonging to each purchase order.
db.exec(`
  CREATE TABLE IF NOT EXISTS purchase_order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_order_id INTEGER NOT NULL
      REFERENCES purchase_orders(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL
      REFERENCES products(id) ON DELETE RESTRICT,
    ordered_quantity REAL NOT NULL
      CHECK (ordered_quantity > 0),
    received_quantity REAL NOT NULL DEFAULT 0
      CHECK (
        received_quantity >= 0
        AND received_quantity <= ordered_quantity
      ),
    unit_cost REAL NOT NULL
      CHECK (unit_cost >= 0),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (purchase_order_id, product_id)
  )
`)

// Indexes for supplier and purchase order lookups.
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier_status
  ON purchase_orders(supplier_id, status)
`)

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_purchase_order_items_order
  ON purchase_order_items(purchase_order_id)
`)

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_purchase_order_items_product
  ON purchase_order_items(product_id)
`)

// Store received inventory in separate batches.
db.exec(`
  CREATE TABLE IF NOT EXISTS inventory_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL
      REFERENCES products(id) ON DELETE RESTRICT,
    quantity_received REAL NOT NULL
      CHECK (quantity_received > 0),
    quantity_remaining REAL NOT NULL
      CHECK (
        quantity_remaining >= 0
        AND quantity_remaining <= quantity_received
      ),
    expiration_date TEXT,
    received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`)

// Speed up inventory lookups by product.
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_inventory_batches_product_id
  ON inventory_batches(product_id)
`)

// Record inventory movements for inventory history.
db.exec(`
  CREATE TABLE IF NOT EXISTS inventory_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL
      REFERENCES products(id) ON DELETE RESTRICT,
    batch_id INTEGER
      REFERENCES inventory_batches(id) ON DELETE RESTRICT,
    movement_type TEXT NOT NULL
      CHECK (
        movement_type IN ('received', 'sale', 'expired', 'damaged')
      ),
    quantity_change REAL NOT NULL
      CHECK (quantity_change != 0),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`)

// Migrate existing databases to support expired and damaged movements.
const movementSchema =
  db.prepare(`
    SELECT sql
    FROM sqlite_master
    WHERE type = 'table' AND name = 'inventory_movements'
  `).get()?.sql ?? ''

if (
  !movementSchema.includes("'expired'") ||
  !movementSchema.includes("'damaged'")
) {
  const migrateMovementTypes = db.transaction(() => {
    db.exec(`
      CREATE TABLE inventory_movements_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL
          REFERENCES products(id) ON DELETE RESTRICT,
        batch_id INTEGER
          REFERENCES inventory_batches(id) ON DELETE RESTRICT,
        movement_type TEXT NOT NULL
          CHECK (
            movement_type IN ('received', 'sale', 'expired', 'damaged')
          ),
        quantity_change REAL NOT NULL
          CHECK (quantity_change != 0),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `)

    db.exec(`
      INSERT INTO inventory_movements_new (
        id,
        product_id,
        batch_id,
        movement_type,
        quantity_change,
        created_at
      )
      SELECT
        id,
        product_id,
        batch_id,
        movement_type,
        quantity_change,
        created_at
      FROM inventory_movements
    `)

    db.exec('DROP TABLE inventory_movements')
    db.exec(`
      ALTER TABLE inventory_movements_new
      RENAME TO inventory_movements
    `)
  })

  migrateMovementTypes()
}

// Index inventory history by product and date.
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_inventory_movements_product_created
  ON inventory_movements(product_id, created_at DESC)
`)

// Record expired or damaged inventory transferred out of available stock.
db.exec(`
  CREATE TABLE IF NOT EXISTS inventory_dispositions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL
      REFERENCES products(id) ON DELETE RESTRICT,
    batch_id INTEGER NOT NULL
      REFERENCES inventory_batches(id) ON DELETE RESTRICT,
    reason TEXT NOT NULL
      CHECK (reason IN ('expired', 'damaged')),
    destination TEXT NOT NULL
      CHECK (destination IN ('returns', 'disposal')),
    quantity REAL NOT NULL
      CHECK (quantity > 0),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`)

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_inventory_dispositions_product_created
  ON inventory_dispositions(product_id, created_at DESC)
`)


// Backfill receipt history for batches created before movement logging.
db.exec(`
  INSERT INTO inventory_movements (
    product_id,
    batch_id,
    movement_type,
    quantity_change,
    created_at
  )
  SELECT
    b.product_id,
    b.id,
    'received',
    b.quantity_received,
    b.received_at
  FROM inventory_batches AS b
  WHERE NOT EXISTS (
    SELECT 1
    FROM inventory_movements AS m
    WHERE m.batch_id = b.id
      AND m.movement_type = 'received'
  )
`)

// Insert the initial categories without duplicating existing ones.
const defaultCategories = [
  'Produce',
  'Dairy',
  'Bakery',
  'Pantry',
  'Frozen',
]

const insertCategory = db.prepare(`
  INSERT OR IGNORE INTO categories (name)
  VALUES (?)
`)

const seedCategories = db.transaction(() => {
  for (const category of defaultCategories) {
    insertCategory.run(category)
  }
})

seedCategories()

module.exports = db