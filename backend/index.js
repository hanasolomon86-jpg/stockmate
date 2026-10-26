const express = require('express')
const db = require('./database')

const app = express()
const PORT = process.env.PORT || 3000

app.use(express.json())

// Reusable list of product fields returned by the API.
const productFields = `
  id,
  name,
  category,
  unit,
  sale_price AS salePrice,
  min_stock AS minStock,
  target_stock AS targetStock,
  barcode,
  created_at AS createdAt,
  updated_at AS updatedAt
`

// Health check.
app.get('/api/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        message: 'StockMate API is running',
    })
})

// Return all products stored in SQLite.
app.get('/api/products', (req, res) => {
    try {
        const products = db
            .prepare(`SELECT ${productFields} FROM products ORDER BY name`)
            .all()

        res.status(200).json(products)
    } catch (error) {
        console.error('Failed to retrieve products:', error.message)

        res.status(500).json({
            error: 'Failed to retrieve products',
        })
    }
})

// Create a new product.
app.post('/api/products', (req, res) => {
    const {
        name,
        category,
        unit,
        salePrice,
        minStock,
        targetStock,
        barcode,
    } = req.body

    // Validate required text fields.
    if (
        typeof name !== 'string' ||
        !name.trim() ||
        typeof category !== 'string' ||
        !category.trim() ||
        typeof unit !== 'string' ||
        !unit.trim()
    ) {
        return res.status(400).json({
            error: 'Name, category, and unit are required.',
        })
    }

    // Validate numeric fields.
    if (
        typeof salePrice !== 'number' ||
        !Number.isFinite(salePrice) ||
        salePrice < 0
    ) {
        return res.status(400).json({
            error: 'Sale price must be a non-negative number.',
        })
    }

    if (
        !Number.isInteger(minStock) ||
        minStock < 0 ||
        !Number.isInteger(targetStock) ||
        targetStock < 0
    ) {
        return res.status(400).json({
            error: 'Stock levels must be non-negative whole numbers.',
        })
    }

    if (targetStock < minStock) {
        return res.status(400).json({
            error: 'Target stock cannot be lower than minimum stock.',
        })
    }

    // A blank barcode is stored as NULL so multiple products
    // can have no barcode.
    if (barcode !== undefined && typeof barcode !== 'string') {
        return res.status(400).json({
            error: 'Barcode must be text.',
        })
    }

    const cleanBarcode = barcode?.trim() || null

    try {
        const result = db
            .prepare(`
        INSERT INTO products (
          name,
          category,
          unit,
          sale_price,
          min_stock,
          target_stock,
          barcode
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
            .run(
                name.trim(),
                category.trim(),
                unit.trim(),
                salePrice,
                minStock,
                targetStock,
                cleanBarcode,
            )

        const product = db
            .prepare(`SELECT ${productFields} FROM products WHERE id = ?`)
            .get(result.lastInsertRowid)

        console.log(`Product created: ${product.id}`)

        return res.status(201).json(product)
    } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(409).json({
                error: 'This barcode is already assigned to another product.',
            })
        }

        console.error('Failed to create product:', error.message)

        return res.status(500).json({
            error: 'Failed to create product',
        })
    }
})

// Update an existing product.
app.put('/api/products/:id', (req, res) => {
    const id = Number(req.params.id)

    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({
            error: 'Invalid product ID.',
        })
    }

    const {
        name,
        category,
        unit,
        salePrice,
        minStock,
        targetStock,
        barcode,
    } = req.body

    if (
        typeof name !== 'string' ||
        !name.trim() ||
        typeof category !== 'string' ||
        !category.trim() ||
        typeof unit !== 'string' ||
        !unit.trim()
    ) {
        return res.status(400).json({
            error: 'Name, category, and unit are required.',
        })
    }

    if (
        typeof salePrice !== 'number' ||
        !Number.isFinite(salePrice) ||
        salePrice < 0
    ) {
        return res.status(400).json({
            error: 'Sale price must be a non-negative number.',
        })
    }

    if (
        !Number.isInteger(minStock) ||
        minStock < 0 ||
        !Number.isInteger(targetStock) ||
        targetStock < minStock
    ) {
        return res.status(400).json({
            error: 'Stock levels are invalid.',
        })
    }

    if (barcode !== undefined && typeof barcode !== 'string') {
        return res.status(400).json({
            error: 'Barcode must be text.',
        })
    }

    const cleanBarcode = barcode?.trim() || null

    try {
        const result = db
            .prepare(`
        UPDATE products
        SET
          name = ?,
          category = ?,
          unit = ?,
          sale_price = ?,
          min_stock = ?,
          target_stock = ?,
          barcode = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
            .run(
                name.trim(),
                category.trim(),
                unit.trim(),
                salePrice,
                minStock,
                targetStock,
                cleanBarcode,
                id,
            )

        if (result.changes === 0) {
            return res.status(404).json({
                error: 'Product not found.',
            })
        }

        const product = db
            .prepare(`SELECT ${productFields} FROM products WHERE id = ?`)
            .get(id)

        console.log(`Product updated: ${id}`)

        return res.status(200).json(product)
    } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(409).json({
                error: 'This barcode is already assigned to another product.',
            })
        }

        console.error('Failed to update product:', error.message)

        return res.status(500).json({
            error: 'Failed to update product',
        })
    }
})
// Delete an existing product.
app.delete('/api/products/:id', (req, res) => {
    const id = Number(req.params.id)

    if (!Number.isSafeInteger(id) || id <= 0) {
        return res.status(400).json({
            error: 'Invalid product ID.',
        })
    }

    try {
        const product = db
            .prepare(`SELECT id FROM products WHERE id = ?`)
            .get(id)

        if (!product) {
            return res.status(404).json({
                error: 'Product not found.',
            })
        }

        db.prepare('DELETE FROM products WHERE id = ?').run(id)

        console.log(`Product deleted: ${id}`)

        return res.status(200).json({
            message: 'Product deleted successfully.',
            id,
        })
    } catch (error) {
        console.error('Failed to delete product:', error.message)

        return res.status(500).json({
            error: 'Failed to delete product.',
        })
    }
})
app.listen(PORT, () => {
    console.log(`StockMate API is running at http://localhost:${PORT}`)
})