const Database = require('better-sqlite3')
const fs = require('node:fs')
const path = require('node:path')

// Create a folder for the database file if it does not exist.
const dataDirectory = path.join(__dirname, 'data')
fs.mkdirSync(dataDirectory, { recursive: true })

// Open the SQLite database.
const databasePath = path.join(dataDirectory, 'stockmate.db')
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