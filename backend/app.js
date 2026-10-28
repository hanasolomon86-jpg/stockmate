const express = require('express')
const db = require('./database')
const { logEvent } = require('./logger')
const path = require('node:path')

const app = express()
// Log every incoming request without recording request bodies or headers.
app.use((req, res, next) => {
    const startedAt = Date.now()

    res.on('finish', () => {
        const statusCode = res.statusCode
        const level =
            statusCode >= 500
                ? 'error'
                : statusCode >= 400
                    ? 'warn'
                    : 'info'

        logEvent(level, 'http_request', {
            method: req.method,
            path: req.path,
            statusCode,
            durationMs: Date.now() - startedAt,
        })
    })

    next()
})
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
        logEvent('error', 'products_retrieval_failed', { errorName: error.name, errorCode: error.code || 'UNEXPECTED_ERROR' })

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

        logEvent('error', 'product_creation_failed', { errorName: error.name, errorCode: error.code || 'UNEXPECTED_ERROR' })

        return res.status(500).json({
            error: 'Failed to create product',
        })
    }
})

// Update an existing product.
app.put('/api/products/:id', (req, res) => {
    const id = Number(req.params.id)

    if (!Number.isSafeInteger(id) || id <= 0) {
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

        logEvent('error', 'product_update_failed', { errorName: error.name, errorCode: error.code || 'UNEXPECTED_ERROR' })

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
        logEvent('error', 'product_deletion_failed', { errorName: error.name, errorCode: error.code || 'UNEXPECTED_ERROR' })

        return res.status(500).json({
            error: 'Failed to delete product.',
        })
    }
})
// Return all categories stored in SQLite.
app.get('/api/categories', (req, res) => {
    try {
        const categories = db
            .prepare(`
                SELECT
                    id,
                    name,
                    created_at AS createdAt
                FROM categories
                ORDER BY name
            `)
            .all()

        return res.status(200).json(categories)
    } catch (error) {
        logEvent('error', 'categories_retrieval_failed', { errorName: error.name, errorCode: error.code || 'UNEXPECTED_ERROR' })

        return res.status(500).json({
            error: 'Failed to retrieve categories',
        })
    }
})
// Create a new category.
app.post('/api/categories', (req, res) => {
    const name = req.body?.name

    if (typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({
            error: 'Category name is required.',
        })
    }

    const cleanName = name.trim()

    if (cleanName.length > 50) {
        return res.status(400).json({
            error: 'Category name cannot exceed 50 characters.',
        })
    }

    try {
        const result = db
            .prepare('INSERT INTO categories (name) VALUES (?)')
            .run(cleanName)

        const category = db
            .prepare(`
                SELECT
                    id,
                    name,
                    created_at AS createdAt
                FROM categories
                WHERE id = ?
            `)
            .get(result.lastInsertRowid)

        console.log(`Category created: ${category.id}`)

        return res.status(201).json(category)
    } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(409).json({
                error: 'This category already exists.',
            })
        }

        logEvent('error', 'category_creation_failed', { errorName: error.name, errorCode: error.code || 'UNEXPECTED_ERROR' })

        return res.status(500).json({
            error: 'Failed to create category.',
        })
    }
})
// Update an existing category.
app.put('/api/categories/:id', (req, res) => {
    const id = Number(req.params.id)
    const name = req.body?.name

    if (!Number.isSafeInteger(id) || id <= 0) {
        return res.status(400).json({
            error: 'Invalid category ID.',
        })
    }

    if (typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({
            error: 'Category name is required.',
        })
    }

    const cleanName = name.trim()

    if (cleanName.length > 50) {
        return res.status(400).json({
            error: 'Category name cannot exceed 50 characters.',
        })
    }

    try {
        const existingCategory = db
            .prepare('SELECT id, name FROM categories WHERE id = ?')
            .get(id)

        if (!existingCategory) {
            return res.status(404).json({
                error: 'Category not found.',
            })
        }

        const updateCategory = db.transaction(() => {
            db.prepare('UPDATE categories SET name = ? WHERE id = ?')
                .run(cleanName, id)

            // Keep products associated with the renamed category.
            db.prepare(`
                UPDATE products
                SET category = ?, updated_at = CURRENT_TIMESTAMP
                WHERE category = ?
            `).run(cleanName, existingCategory.name)

            return db
                .prepare(`
                    SELECT id, name, created_at AS createdAt
                    FROM categories
                    WHERE id = ?
                `)
                .get(id)
        })

        const category = updateCategory()

        return res.status(200).json(category)
    } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(409).json({
                error: 'This category already exists.',
            })
        }

        logEvent('error', 'category_update_failed', { errorName: error.name, errorCode: error.code || 'UNEXPECTED_ERROR' })

        return res.status(500).json({
            error: 'Failed to update category.',
        })
    }
})

// Delete a category only when no products use it.
app.delete('/api/categories/:id', (req, res) => {
    const id = Number(req.params.id)

    if (!Number.isSafeInteger(id) || id <= 0) {
        return res.status(400).json({
            error: 'Invalid category ID.',
        })
    }

    try {
        const category = db
            .prepare('SELECT id, name FROM categories WHERE id = ?')
            .get(id)

        if (!category) {
            return res.status(404).json({
                error: 'Category not found.',
            })
        }

        const usage = db
            .prepare('SELECT COUNT(*) AS count FROM products WHERE category = ?')
            .get(category.name)

        if (usage.count > 0) {
            return res.status(409).json({
                error: 'Cannot delete a category that is assigned to products.',
            })
        }

        db.prepare('DELETE FROM categories WHERE id = ?').run(id)

        return res.status(200).json({
            message: 'Category deleted successfully.',
            id,
        })
    } catch (error) {
        logEvent('error', 'category_deletion_failed', { errorName: error.name, errorCode: error.code || 'UNEXPECTED_ERROR' })

        return res.status(500).json({
            error: 'Failed to delete category.',
        })
    }
})
// Serve the built React frontend.
const frontendDistPath = path.join(__dirname, '..', 'frontend', 'dist')

app.use(express.static(frontendDistPath))

// Return the React app for frontend routes, but leave API routes untouched.
app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) {
        return next()
    }

    res.sendFile(path.join(frontendDistPath, 'index.html'), (error) => {
        if (error) next(error)
    })
})
module.exports = app
