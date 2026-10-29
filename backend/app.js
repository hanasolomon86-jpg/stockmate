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
  preferred_supplier_id AS preferredSupplierId,
purchase_unit_cost AS purchaseUnitCost,
    COALESCE(
    (
      SELECT SUM(quantity_remaining)
      FROM inventory_batches
      WHERE product_id = products.id
    ),
    0
  ) AS currentStock,
  barcode,
  created_at AS createdAt,
  updated_at AS updatedAt
`
function isValidDateOnly(value) {
    if (
        typeof value !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(value)
    ) {
        return false
    }

    const date = new Date(`${value}T00:00:00.000Z`)

    return (
        !Number.isNaN(date.getTime()) &&
        date.toISOString().slice(0, 10) === value
    )
}

// Health check.
app.get('/api/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        message: 'StockMate API is running',
    })
})

// Receive inventory for an existing product.
app.post('/api/products/:id/inventory-batches', (req, res) => {
    const productId = Number(req.params.id)

    if (!Number.isSafeInteger(productId) || productId <= 0) {
        return res.status(400).json({
            error: 'Invalid product ID.',
        })
    }

    const { quantity, expirationDate } = req.body ?? {}

    if (
        typeof quantity !== 'number' ||
        !Number.isFinite(quantity) ||
        quantity <= 0
    ) {
        return res.status(400).json({
            error: 'Quantity must be a positive number.',
        })
    }

    const cleanExpirationDate =
        expirationDate === undefined ||
            expirationDate === null ||
            expirationDate === ''
            ? null
            : expirationDate

    if (
        cleanExpirationDate !== null &&
        !isValidDateOnly(cleanExpirationDate)
    ) {
        return res.status(400).json({
            error: 'Expiration date must be a valid date in YYYY-MM-DD format.',
        })
    }

    try {
        const product = db
            .prepare('SELECT id FROM products WHERE id = ?')
            .get(productId)

        if (!product) {
            return res.status(404).json({
                error: 'Product not found.',
            })
        }

        const batch = db.transaction(() => {
            const result = db
                .prepare(`
            INSERT INTO inventory_batches (
                product_id,
                quantity_received,
                quantity_remaining,
                expiration_date
            )
            VALUES (?, ?, ?, ?)
        `)
                .run(
                    productId,
                    quantity,
                    quantity,
                    cleanExpirationDate,
                )

            db.prepare(`
        INSERT INTO inventory_movements (
            product_id,
            batch_id,
            movement_type,
            quantity_change
        )
        VALUES (?, ?, 'received', ?)
    `).run(productId, result.lastInsertRowid, quantity)

            return db
                .prepare(`
            SELECT
                id,
                product_id AS productId,
                quantity_received AS quantityReceived,
                quantity_remaining AS quantityRemaining,
                expiration_date AS expirationDate,
                received_at AS receivedAt
            FROM inventory_batches
            WHERE id = ?
        `)
                .get(result.lastInsertRowid)
        })()
        logEvent('info', 'inventory_batch_received', {
            productId,
            batchId: batch.id,
            quantityReceived: quantity,
            expirationDate: cleanExpirationDate,
        })

        return res.status(201).json(batch)
    } catch (error) {
        logEvent('error', 'inventory_batch_creation_failed', {
            errorName: error.name,
            errorCode: error.code || 'UNEXPECTED_ERROR',
        })

        return res.status(500).json({
            error: 'Failed to receive inventory.',
        })
    }
})

// Retrieve inventory batches for an existing product.
app.get('/api/products/:id/inventory-batches', (req, res) => {
    const productId = Number(req.params.id)

    if (!Number.isSafeInteger(productId) || productId <= 0) {
        return res.status(400).json({
            error: 'Invalid product ID.',
        })
    }

    try {
        const product = db
            .prepare('SELECT id FROM products WHERE id = ?')
            .get(productId)

        if (!product) {
            return res.status(404).json({
                error: 'Product not found.',
            })
        }

        const batches = db
            .prepare(`
                SELECT
                    id,
                    product_id AS productId,
                    quantity_received AS quantityReceived,
                    quantity_remaining AS quantityRemaining,
                    expiration_date AS expirationDate,
                    received_at AS receivedAt
                FROM inventory_batches
                WHERE product_id = ?
                ORDER BY expiration_date IS NULL,
                         expiration_date ASC,
                         received_at DESC
            `)
            .all(productId)

        return res.status(200).json(batches)
    } catch (error) {
        logEvent('error', 'inventory_batches_retrieval_failed', {
            errorName: error.name,
            errorCode: error.code || 'UNEXPECTED_ERROR',
        })

        return res.status(500).json({
            error: 'Failed to retrieve inventory batches.',
        })
    }
})

// Retrieve inventory batches that expire within the requested number of days.
// Defaults to 7 days; the allowed range is 1–30 days.
app.get('/api/expiry-alerts', (req, res) => {
    const days =
        req.query.days === undefined ? 7 : Number(req.query.days)

    if (!Number.isInteger(days) || days < 1 || days > 30) {
        return res.status(400).json({
            error: 'Days must be a whole number between 1 and 30.',
        })
    }

    try {
        const expiringBatches = db
            .prepare(`
                SELECT
                    b.id AS batchId,
                    b.product_id AS productId,
                    p.name AS productName,
                    p.category,
                    p.unit,
                    b.quantity_remaining AS quantityRemaining,
                    b.expiration_date AS expirationDate,
                    CAST(
                        julianday(date(b.expiration_date)) -
                        julianday(date('now'))
                        AS INTEGER
                    ) AS daysUntilExpiration
                FROM inventory_batches AS b
                JOIN products AS p
                    ON p.id = b.product_id
                WHERE b.quantity_remaining > 0
                  AND b.expiration_date IS NOT NULL
                  AND date(b.expiration_date) >= date('now')
                  AND date(b.expiration_date) <= date('now', ?)
                ORDER BY
                    date(b.expiration_date) ASC,
                    p.name COLLATE NOCASE
            `)
            .all(`+${days} days`)

        return res.status(200).json(expiringBatches)
    } catch (error) {
        logEvent('error', 'expiry_alerts_retrieval_failed', {
            errorName: error.name,
            errorCode: error.code || 'UNEXPECTED_ERROR',
        })

        return res.status(500).json({
            error: 'Failed to retrieve expiration alerts.',
        })
    }
})

// Retrieve inventory movement history for a product.
app.get('/api/products/:id/inventory-movements', (req, res) => {
    const productId = Number(req.params.id)

    if (!Number.isSafeInteger(productId) || productId <= 0) {
        return res.status(400).json({
            error: 'Invalid product ID.',
        })
    }

    try {
        const product = db
            .prepare('SELECT id FROM products WHERE id = ?')
            .get(productId)

        if (!product) {
            return res.status(404).json({
                error: 'Product not found.',
            })
        }

        const movements = db
            .prepare(`
                SELECT
                    m.id,
                    m.product_id AS productId,
                    m.batch_id AS batchId,
                    m.movement_type AS movementType,
                    m.quantity_change AS quantityChange,
                    m.created_at AS createdAt,
                    b.expiration_date AS expirationDate
                FROM inventory_movements AS m
                LEFT JOIN inventory_batches AS b
                    ON b.id = m.batch_id
                WHERE m.product_id = ?
                ORDER BY m.created_at DESC, m.id DESC
            `)
            .all(productId)

        return res.status(200).json(movements)
    } catch (error) {
        logEvent('error', 'inventory_history_retrieval_failed', {
            errorName: error.name,
            errorCode: error.code || 'UNEXPECTED_ERROR',
        })

        return res.status(500).json({
            error: 'Failed to retrieve inventory history.',
        })
    }
})

// Record expired or damaged inventory transferred out of available stock.
app.post(
    '/api/products/:id/inventory-batches/:batchId/dispositions',
    (req, res) => {
        const productId = Number(req.params.id)
        const batchId = Number(req.params.batchId)
        const { quantity, reason, destination } = req.body ?? {}

        if (!Number.isSafeInteger(productId) || productId <= 0) {
            return res.status(400).json({
                error: 'Invalid product ID.',
            })
        }

        if (!Number.isSafeInteger(batchId) || batchId <= 0) {
            return res.status(400).json({
                error: 'Invalid inventory batch ID.',
            })
        }

        if (
            typeof quantity !== 'number' ||
            !Number.isFinite(quantity) ||
            quantity <= 0
        ) {
            return res.status(400).json({
                error: 'Disposition quantity must be a positive number.',
            })
        }

        if (!['expired', 'damaged'].includes(reason)) {
            return res.status(400).json({
                error: 'Reason must be expired or damaged.',
            })
        }

        if (!['returns', 'disposal'].includes(destination)) {
            return res.status(400).json({
                error: 'Destination must be returns or disposal.',
            })
        }

        try {
            const product = db
                .prepare('SELECT id FROM products WHERE id = ?')
                .get(productId)

            if (!product) {
                return res.status(404).json({
                    error: 'Product not found.',
                })
            }

            const result = db.transaction(() => {
                const batch = db
                    .prepare(`
                        SELECT
                            id,
                            quantity_remaining AS quantityRemaining
                        FROM inventory_batches
                        WHERE id = ? AND product_id = ?
                    `)
                    .get(batchId, productId)

                if (!batch) {
                    return { batchNotFound: true }
                }

                if (quantity > batch.quantityRemaining) {
                    return {
                        insufficientStock: true,
                        availableQuantity: batch.quantityRemaining,
                    }
                }

                const updateResult = db
                    .prepare(`
                        UPDATE inventory_batches
                        SET quantity_remaining = quantity_remaining - ?
                        WHERE id = ?
                          AND quantity_remaining >= ?
                    `)
                    .run(quantity, batchId, quantity)

                if (updateResult.changes !== 1) {
                    return {
                        insufficientStock: true,
                        availableQuantity: batch.quantityRemaining,
                    }
                }

                const dispositionResult = db
                    .prepare(`
                        INSERT INTO inventory_dispositions (
                            product_id,
                            batch_id,
                            reason,
                            destination,
                            quantity
                        )
                        VALUES (?, ?, ?, ?, ?)
                    `)
                    .run(
                        productId,
                        batchId,
                        reason,
                        destination,
                        quantity,
                    )

                db.prepare(`
                    INSERT INTO inventory_movements (
                        product_id,
                        batch_id,
                        movement_type,
                        quantity_change
                    )
                    VALUES (?, ?, ?, ?)
                `).run(productId, batchId, reason, -quantity)

                const disposition = db
                    .prepare(`
                        SELECT
                            id,
                            product_id AS productId,
                            batch_id AS batchId,
                            reason,
                            destination,
                            quantity,
                            created_at AS createdAt
                        FROM inventory_dispositions
                        WHERE id = ?
                    `)
                    .get(dispositionResult.lastInsertRowid)

                const stock = db
                    .prepare(`
                        SELECT COALESCE(
                            SUM(quantity_remaining),
                            0
                        ) AS currentStock
                        FROM inventory_batches
                        WHERE product_id = ?
                    `)
                    .get(productId)

                return {
                    disposition,
                    currentStock: stock.currentStock,
                }
            })()

            if (result.batchNotFound) {
                return res.status(404).json({
                    error: 'Inventory batch not found for this product.',
                })
            }

            if (result.insufficientStock) {
                return res.status(409).json({
                    error: 'Disposition quantity exceeds available quantity in this batch.',
                    availableQuantity: result.availableQuantity,
                })
            }

            logEvent('info', 'inventory_disposition_recorded', {
                productId,
                batchId,
                reason,
                destination,
                quantity,
            })

            return res.status(201).json(result)
        } catch (error) {
            logEvent('error', 'inventory_disposition_recording_failed', {
                errorName: error.name,
                errorCode: error.code || 'UNEXPECTED_ERROR',
            })

            return res.status(500).json({
                error: 'Failed to record inventory disposition.',
            })
        }
    },
)

// Retrieve expired and damaged inventory records for a product.
app.get('/api/products/:id/inventory-dispositions', (req, res) => {
    const productId = Number(req.params.id)

    if (!Number.isSafeInteger(productId) || productId <= 0) {
        return res.status(400).json({
            error: 'Invalid product ID.',
        })
    }

    try {
        const product = db
            .prepare('SELECT id FROM products WHERE id = ?')
            .get(productId)

        if (!product) {
            return res.status(404).json({
                error: 'Product not found.',
            })
        }

        const dispositions = db
            .prepare(`
                SELECT
                    d.id,
                    d.product_id AS productId,
                    d.batch_id AS batchId,
                    d.reason,
                    d.destination,
                    d.quantity,
                    d.created_at AS createdAt,
                    b.expiration_date AS expirationDate
                FROM inventory_dispositions AS d
                JOIN inventory_batches AS b
                    ON b.id = d.batch_id
                WHERE d.product_id = ?
                ORDER BY d.created_at DESC, d.id DESC
            `)
            .all(productId)

        return res.status(200).json(dispositions)
    } catch (error) {
        logEvent('error', 'inventory_dispositions_retrieval_failed', {
            errorName: error.name,
            errorCode: error.code || 'UNEXPECTED_ERROR',
        })

        return res.status(500).json({
            error: 'Failed to retrieve inventory dispositions.',
        })
    }
})

// Record a sale and deduct stock from the earliest-expiring batches first.
app.post('/api/products/:id/sales', (req, res) => {
    const productId = Number(req.params.id)
    const { quantity } = req.body ?? {}

    if (!Number.isSafeInteger(productId) || productId <= 0) {
        return res.status(400).json({
            error: 'Invalid product ID.',
        })
    }

    if (
        typeof quantity !== 'number' ||
        !Number.isFinite(quantity) ||
        quantity <= 0
    ) {
        return res.status(400).json({
            error: 'Sale quantity must be a positive number.',
        })
    }

    try {
        const product = db
            .prepare('SELECT id FROM products WHERE id = ?')
            .get(productId)

        if (!product) {
            return res.status(404).json({
                error: 'Product not found.',
            })
        }

        const saleResult = db.transaction(() => {
            const batches = db
                .prepare(`
                    SELECT id, quantity_remaining AS quantityRemaining
                    FROM inventory_batches
                    WHERE product_id = ?
                      AND quantity_remaining > 0
                    ORDER BY
                      expiration_date IS NULL ASC,
                      expiration_date ASC,
                      received_at ASC,
                      id ASC
                `)
                .all(productId)

            const availableStock = batches.reduce(
                (total, batch) => total + batch.quantityRemaining,
                0,
            )

            if (quantity > availableStock) {
                return {
                    insufficientStock: true,
                    currentStock: availableStock,
                }
            }

            let remainingToSell = quantity

            const updateBatch = db.prepare(`
                UPDATE inventory_batches
                SET quantity_remaining = quantity_remaining - ?
                WHERE id = ?
                  AND quantity_remaining >= ?
            `)

            const recordMovement = db.prepare(`
                INSERT INTO inventory_movements (
                    product_id,
                    batch_id,
                    movement_type,
                    quantity_change
                )
                VALUES (?, ?, 'sale', ?)
            `)

            for (const batch of batches) {
                if (remainingToSell <= 0) {
                    break
                }

                const quantityFromBatch = Math.min(
                    batch.quantityRemaining,
                    remainingToSell,
                )

                if (quantityFromBatch <= 0) {
                    continue
                }

                const updateResult = updateBatch.run(
                    quantityFromBatch,
                    batch.id,
                    quantityFromBatch,
                )

                if (updateResult.changes !== 1) {
                    throw new Error('Inventory update failed')
                }

                recordMovement.run(
                    productId,
                    batch.id,
                    -quantityFromBatch,
                )

                remainingToSell = Math.max(
                    0,
                    remainingToSell - quantityFromBatch,
                )
            }

            const currentStock = db
                .prepare(`
                    SELECT COALESCE(SUM(quantity_remaining), 0) AS currentStock
                    FROM inventory_batches
                    WHERE product_id = ?
                `)
                .get(productId).currentStock

            return {
                insufficientStock: false,
                currentStock,
            }
        })()

        if (saleResult.insufficientStock) {
            logEvent('warn', 'sale_rejected_insufficient_stock', {
                productId,
                quantityRequested: quantity,
                currentStock: saleResult.currentStock,
            })

            return res.status(409).json({
                error: 'Insufficient stock for this sale.',
                currentStock: saleResult.currentStock,
            })
        }

        logEvent('info', 'sale_recorded', {
            productId,
            quantitySold: quantity,
            currentStock: saleResult.currentStock,
        })

        return res.status(201).json({
            productId,
            quantitySold: quantity,
            currentStock: saleResult.currentStock,
        })
    } catch (error) {
        logEvent('error', 'sale_creation_failed', {
            errorName: error.name,
            errorCode: error.code || 'UNEXPECTED_ERROR',
        })

        return res.status(500).json({
            error: 'Failed to record sale.',
        })
    }
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
        preferredSupplierId,
        purchaseUnitCost,
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

    const cleanPreferredSupplierId =
        preferredSupplierId === undefined ||
            preferredSupplierId === null ||
            preferredSupplierId === ''
            ? null
            : Number(preferredSupplierId)

    const cleanPurchaseUnitCost =
        purchaseUnitCost === undefined ? 0 : purchaseUnitCost

    if (
        cleanPreferredSupplierId !== null &&
        (!Number.isSafeInteger(cleanPreferredSupplierId) ||
            cleanPreferredSupplierId <= 0)
    ) {
        return res.status(400).json({
            error: 'Preferred supplier ID is invalid.',
        })
    }

    if (
        typeof cleanPurchaseUnitCost !== 'number' ||
        !Number.isFinite(cleanPurchaseUnitCost) ||
        cleanPurchaseUnitCost < 0
    ) {
        return res.status(400).json({
            error: 'Purchase unit cost must be a non-negative number.',
        })
    }

    try {
        if (cleanPreferredSupplierId !== null) {
            const supplier = db
                .prepare(`
            SELECT id, is_active AS isActive
            FROM suppliers
            WHERE id = ?
        `)
                .get(cleanPreferredSupplierId)

            if (!supplier) {
                return res.status(404).json({
                    error: 'Preferred supplier not found.',
                })
            }

            if (!supplier.isActive) {
                return res.status(409).json({
                    error: 'Preferred supplier must be active.',
                })
            }
        }
        const result = db
            .prepare(`
        INSERT INTO products (
            name,
            category,
            unit,
            sale_price,
            min_stock,
            target_stock,
            preferred_supplier_id,
            purchase_unit_cost,
            barcode
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
            .run(
                name.trim(),
                category.trim(),
                unit.trim(),
                salePrice,
                minStock,
                targetStock,
                cleanPreferredSupplierId,
                cleanPurchaseUnitCost,
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
        preferredSupplierId,
        purchaseUnitCost,
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
        const existingProduct = db
            .prepare(`
        SELECT
            id,
            preferred_supplier_id AS preferredSupplierId,
            purchase_unit_cost AS purchaseUnitCost
        FROM products
        WHERE id = ?
    `)
            .get(id)

        if (!existingProduct) {
            return res.status(404).json({
                error: 'Product not found.',
            })
        }

        const cleanPreferredSupplierId =
            preferredSupplierId === undefined
                ? existingProduct.preferredSupplierId
                : preferredSupplierId === null || preferredSupplierId === ''
                    ? null
                    : Number(preferredSupplierId)

        const cleanPurchaseUnitCost =
            purchaseUnitCost === undefined
                ? existingProduct.purchaseUnitCost
                : purchaseUnitCost

        if (
            cleanPreferredSupplierId !== null &&
            (!Number.isSafeInteger(cleanPreferredSupplierId) ||
                cleanPreferredSupplierId <= 0)
        ) {
            return res.status(400).json({
                error: 'Preferred supplier ID is invalid.',
            })
        }

        if (
            typeof cleanPurchaseUnitCost !== 'number' ||
            !Number.isFinite(cleanPurchaseUnitCost) ||
            cleanPurchaseUnitCost < 0
        ) {
            return res.status(400).json({
                error: 'Purchase unit cost must be a non-negative number.',
            })
        }

        if (cleanPreferredSupplierId !== null) {
            const supplier = db
                .prepare(`
            SELECT id, is_active AS isActive
            FROM suppliers
            WHERE id = ?
        `)
                .get(cleanPreferredSupplierId)

            if (!supplier) {
                return res.status(404).json({
                    error: 'Preferred supplier not found.',
                })
            }

            if (!supplier.isActive) {
                return res.status(409).json({
                    error: 'Preferred supplier must be active.',
                })
            }
        }
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
          preferred_supplier_id = ?,
purchase_unit_cost = ?,
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
                cleanPreferredSupplierId,
                cleanPurchaseUnitCost,
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

        const inventoryBatches = db
            .prepare(`
                SELECT COUNT(*) AS count
                FROM inventory_batches
                WHERE product_id = ?
            `)
            .get(id)

        if (inventoryBatches.count > 0) {
            return res.status(409).json({
                error: 'Products with inventory batches cannot be deleted.',
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

// Reusable supplier fields and optional-field validation.
const supplierFields = `
    id,
    name,
    contact_name AS contactName,
    phone,
    email,
    notes,
    is_active AS isActive,
    created_at AS createdAt,
    updated_at AS updatedAt
`

function validateSupplierOptionalFields(body, existing = null) {
    const definitions = [
        { key: 'contactName', column: 'contact_name', label: 'Contact name', max: 100 },
        { key: 'phone', column: 'phone', label: 'Phone', max: 30 },
        { key: 'email', column: 'email', label: 'Email', max: 254 },
        { key: 'notes', column: 'notes', label: 'Notes', max: 1000 },
    ]

    const values = {}

    for (const field of definitions) {
        let value = body[field.key]

        if (value === undefined && existing) {
            value = existing[field.column]
        }

        if (value === undefined || value === null) {
            values[field.key] = null
            continue
        }

        if (typeof value !== 'string') {
            return { error: `${field.label} must be text.` }
        }

        value = value.trim()

        if (value.length > field.max) {
            return {
                error: `${field.label} cannot exceed ${field.max} characters.`,
            }
        }

        values[field.key] = value || null
    }

    if (
        values.email &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)
    ) {
        return { error: 'Please provide a valid email address.' }
    }

    return { values }
}

// Retrieve all suppliers.
app.get('/api/suppliers', (req, res) => {
    try {
        const suppliers = db
            .prepare(`
                SELECT ${supplierFields}
                FROM suppliers
                ORDER BY is_active DESC, name COLLATE NOCASE
            `)
            .all()

        return res.status(200).json(suppliers)
    } catch (error) {
        logEvent('error', 'suppliers_retrieval_failed', {
            errorName: error.name,
            errorCode: error.code || 'UNEXPECTED_ERROR',
        })

        return res.status(500).json({
            error: 'Failed to retrieve suppliers.',
        })
    }
})

// Create a supplier.
app.post('/api/suppliers', (req, res) => {
    const body = req.body ?? {}
    const name = body.name

    if (typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({
            error: 'Supplier name is required.',
        })
    }

    const cleanName = name.trim()

    if (cleanName.length > 100) {
        return res.status(400).json({
            error: 'Supplier name cannot exceed 100 characters.',
        })
    }

    const validation = validateSupplierOptionalFields(body)

    if (validation.error) {
        return res.status(400).json({
            error: validation.error,
        })
    }

    try {
        const { contactName, phone, email, notes } = validation.values

        const result = db
            .prepare(`
                INSERT INTO suppliers (
                    name, contact_name, phone, email, notes
                )
                VALUES (?, ?, ?, ?, ?)
            `)
            .run(cleanName, contactName, phone, email, notes)

        const supplier = db
            .prepare(`
                SELECT ${supplierFields}
                FROM suppliers
                WHERE id = ?
            `)
            .get(result.lastInsertRowid)

        return res.status(201).json(supplier)
    } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(409).json({
                error: 'A supplier with this name already exists.',
            })
        }

        logEvent('error', 'supplier_creation_failed', {
            errorName: error.name,
            errorCode: error.code || 'UNEXPECTED_ERROR',
        })

        return res.status(500).json({
            error: 'Failed to create supplier.',
        })
    }
})

// Update supplier details or active status.
app.put('/api/suppliers/:id', (req, res) => {
    const id = Number(req.params.id)
    const body = req.body ?? {}
    const name = body.name

    if (!Number.isSafeInteger(id) || id <= 0) {
        return res.status(400).json({
            error: 'Invalid supplier ID.',
        })
    }

    if (typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({
            error: 'Supplier name is required.',
        })
    }

    const cleanName = name.trim()

    if (cleanName.length > 100) {
        return res.status(400).json({
            error: 'Supplier name cannot exceed 100 characters.',
        })
    }

    if (
        body.isActive !== undefined &&
        ![true, false, 0, 1].includes(body.isActive)
    ) {
        return res.status(400).json({
            error: 'isActive must be true or false.',
        })
    }

    try {
        const existing = db
            .prepare('SELECT * FROM suppliers WHERE id = ?')
            .get(id)

        if (!existing) {
            return res.status(404).json({
                error: 'Supplier not found.',
            })
        }

        const validation = validateSupplierOptionalFields(body, existing)

        if (validation.error) {
            return res.status(400).json({
                error: validation.error,
            })
        }

        const { contactName, phone, email, notes } = validation.values
        const isActive =
            body.isActive === undefined
                ? existing.is_active
                : Number(body.isActive)

        db.prepare(`
            UPDATE suppliers
            SET
                name = ?,
                contact_name = ?,
                phone = ?,
                email = ?,
                notes = ?,
                is_active = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(
            cleanName,
            contactName,
            phone,
            email,
            notes,
            isActive,
            id,
        )

        const supplier = db
            .prepare(`
                SELECT ${supplierFields}
                FROM suppliers
                WHERE id = ?
            `)
            .get(id)

        return res.status(200).json(supplier)
    } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(409).json({
                error: 'A supplier with this name already exists.',
            })
        }

        logEvent('error', 'supplier_update_failed', {
            errorName: error.name,
            errorCode: error.code || 'UNEXPECTED_ERROR',
        })

        return res.status(500).json({
            error: 'Failed to update supplier.',
        })
    }
})

// Return a purchase order with supplier details and its line items.
function getPurchaseOrderById(orderId) {
    const order = db
        .prepare(`
            SELECT
                po.id,
                po.supplier_id AS supplierId,
                s.name AS supplierName,
                po.status,
                po.notes,
                po.ordered_at AS orderedAt,
                po.created_at AS createdAt,
                po.updated_at AS updatedAt
            FROM purchase_orders AS po
            JOIN suppliers AS s ON s.id = po.supplier_id
            WHERE po.id = ?
        `)
        .get(orderId)

    if (!order) {
        return null
    }

    const items = db
        .prepare(`
            SELECT
                poi.id,
                poi.product_id AS productId,
                p.name AS productName,
                p.unit,
                poi.ordered_quantity AS orderedQuantity,
                poi.received_quantity AS receivedQuantity,
                poi.ordered_quantity - poi.received_quantity
                    AS remainingQuantity,
                poi.unit_cost AS unitCost
            FROM purchase_order_items AS poi
            JOIN products AS p ON p.id = poi.product_id
            WHERE poi.purchase_order_id = ?
            ORDER BY poi.id
        `)
        .all(orderId)

    return { ...order, items }
}

// Calculate low-stock alerts and recommended reorder quantities.
function getLowStockAlerts() {
    const products = db
        .prepare(`
            SELECT
                p.id,
                p.name,
                p.category,
                p.unit,
                p.min_stock AS minStock,
                p.target_stock AS targetStock,
                p.preferred_supplier_id AS preferredSupplierId,
                p.purchase_unit_cost AS purchaseUnitCost,
                s.name AS preferredSupplierName,
                s.is_active AS preferredSupplierIsActive,

                COALESCE(
                    (
                        SELECT SUM(b.quantity_remaining)
                        FROM inventory_batches AS b
                        WHERE b.product_id = p.id
                    ),
                    0
                ) AS currentStock,

                COALESCE(
                    (
                        SELECT SUM(
                            poi.ordered_quantity - poi.received_quantity
                        )
                        FROM purchase_order_items AS poi
                        JOIN purchase_orders AS po
                            ON po.id = poi.purchase_order_id
                        WHERE poi.product_id = p.id
                          AND po.status IN (
                              'ordered',
                              'partially_received'
                          )
                    ),
                    0
                ) AS incomingQuantity,

                (
                    SELECT po.id
                    FROM purchase_orders AS po
                    JOIN purchase_order_items AS poi
                        ON poi.purchase_order_id = po.id
                    WHERE po.supplier_id = p.preferred_supplier_id
                      AND poi.product_id = p.id
                      AND po.status = 'draft'
                    ORDER BY po.created_at DESC, po.id DESC
                    LIMIT 1
                ) AS existingDraftOrderId

            FROM products AS p
            LEFT JOIN suppliers AS s
                ON s.id = p.preferred_supplier_id

            WHERE COALESCE(
                (
                    SELECT SUM(b.quantity_remaining)
                    FROM inventory_batches AS b
                    WHERE b.product_id = p.id
                ),
                0
            ) <= p.min_stock

            ORDER BY p.name COLLATE NOCASE
        `)
        .all()

    return products.map((product) => {
        const recommendedQuantity = Math.max(
            0,
            product.targetStock -
            product.currentStock -
            product.incomingQuantity,
        )

        const hasPreferredSupplier =
            product.preferredSupplierId !== null

        const preferredSupplierActive =
            product.preferredSupplierIsActive === 1

        const draftAlreadyExists =
            product.existingDraftOrderId !== null

        return {
            ...product,
            projectedStock:
                product.currentStock + product.incomingQuantity,
            recommendedQuantity,
            hasPreferredSupplier,
            preferredSupplierActive,
            draftAlreadyExists,
            canGenerateDraft:
                recommendedQuantity > 0 &&
                hasPreferredSupplier &&
                preferredSupplierActive &&
                product.purchaseUnitCost > 0 &&
                !draftAlreadyExists,
        }
    })
}

// Retrieve products whose available stock is at or below minimum.
app.get('/api/stock-alerts', (req, res) => {
    try {
        return res.status(200).json(getLowStockAlerts())
    } catch (error) {
        logEvent('error', 'stock_alerts_retrieval_failed', {
            errorName: error.name,
            errorCode: error.code || 'UNEXPECTED_ERROR',
        })

        return res.status(500).json({
            error: 'Failed to retrieve stock alerts.',
        })
    }
})

// Generate draft purchase orders for eligible low-stock products.
app.post('/api/stock-alerts/generate-drafts', (req, res) => {
    const productIds = req.body?.productIds

    if (!Array.isArray(productIds) || productIds.length === 0) {
        return res.status(400).json({
            error: 'Select at least one product for draft generation.',
        })
    }

    if (
        productIds.some((id) => !Number.isInteger(id) || id <= 0) ||
        new Set(productIds).size !== productIds.length
    ) {
        return res.status(400).json({
            error: 'Product IDs must be unique positive integers.',
        })
    }

    const selectedProductIds = new Set(productIds)
    try {
        const result = db.transaction(() => {
            // Recalculate alerts using the latest stock and order data.
            const eligibleAlerts = getLowStockAlerts().filter(
                (alert) =>
                    selectedProductIds.has(alert.id) &&
                    alert.canGenerateDraft,
            )

            const orderIds = new Set()
            const createdOrderIds = new Set()
            let addedItemCount = 0

            const findDraftOrder = db.prepare(`
                SELECT id
                FROM purchase_orders
                WHERE supplier_id = ?
                  AND status = 'draft'
                ORDER BY created_at DESC, id DESC
                LIMIT 1
            `)

            const createDraftOrder = db.prepare(`
                INSERT INTO purchase_orders (supplier_id, notes)
                VALUES (?, ?)
            `)

            const findExistingOrderItem = db.prepare(`
                SELECT id
                FROM purchase_order_items
                WHERE purchase_order_id = ?
                  AND product_id = ?
            `)

            const insertOrderItem = db.prepare(`
                INSERT INTO purchase_order_items (
                    purchase_order_id,
                    product_id,
                    ordered_quantity,
                    unit_cost
                )
                VALUES (?, ?, ?, ?)
            `)

            for (const alert of eligibleAlerts) {
                let draftOrder = findDraftOrder.get(
                    alert.preferredSupplierId,
                )

                let orderId

                if (draftOrder) {
                    orderId = draftOrder.id
                } else {
                    const createdOrder = createDraftOrder.run(
                        alert.preferredSupplierId,
                        'Generated from a low-stock alert. Review before ordering.',
                    )

                    orderId = Number(createdOrder.lastInsertRowid)
                    createdOrderIds.add(orderId)
                }

                // Avoid adding the same product twice to one draft.
                const existingItem = findExistingOrderItem.get(
                    orderId,
                    alert.id,
                )

                if (existingItem) {
                    continue
                }

                insertOrderItem.run(
                    orderId,
                    alert.id,
                    alert.recommendedQuantity,
                    alert.purchaseUnitCost,
                )

                orderIds.add(orderId)
                addedItemCount++
            }

            return {
                orderIds: [...orderIds],
                createdOrderIds: [...createdOrderIds],
                addedItemCount,
            }
        })()

        const orders = result.orderIds.map((id) =>
            getPurchaseOrderById(id),
        )

        logEvent('info', 'low_stock_draft_generation_completed', {
            createdOrderCount: result.createdOrderIds.length,
            addedItemCount: result.addedItemCount,
        })

        return res
            .status(result.createdOrderIds.length > 0 ? 201 : 200)
            .json({
                message:
                    result.addedItemCount > 0
                        ? 'Draft purchase orders generated successfully.'
                        : 'No selected products are currently eligible for draft generation.',
                createdOrderCount: result.createdOrderIds.length,
                addedItemCount: result.addedItemCount,
                orders,
            })
    } catch (error) {
        logEvent('error', 'low_stock_draft_generation_failed', {
            errorName: error.name,
            errorCode: error.code || 'UNEXPECTED_ERROR',
        })

        return res.status(500).json({
            error: 'Failed to generate draft purchase orders.',
        })
    }
})

// Retrieve all purchase orders, including their items.
app.get('/api/purchase-orders', (req, res) => {
    try {
        const orders = db
            .prepare(`
                SELECT id
                FROM purchase_orders
                ORDER BY created_at DESC, id DESC
            `)
            .all()
            .map(({ id }) => getPurchaseOrderById(id))

        return res.status(200).json(orders)
    } catch (error) {
        logEvent('error', 'purchase_orders_retrieval_failed', {
            errorName: error.name,
            errorCode: error.code || 'UNEXPECTED_ERROR',
        })

        return res.status(500).json({
            error: 'Failed to retrieve purchase orders.',
        })
    }
})

// Create a purchase order in draft status.
app.post('/api/purchase-orders', (req, res) => {
    const body = req.body ?? {}
    const supplierId = Number(body.supplierId)
    const { items } = body

    if (!Number.isSafeInteger(supplierId) || supplierId <= 0) {
        return res.status(400).json({
            error: 'A valid supplier ID is required.',
        })
    }

    if (
        body.notes !== undefined &&
        body.notes !== null &&
        typeof body.notes !== 'string'
    ) {
        return res.status(400).json({
            error: 'Notes must be text.',
        })
    }

    const notes = body.notes?.trim() || null

    if (notes && notes.length > 1000) {
        return res.status(400).json({
            error: 'Notes cannot exceed 1000 characters.',
        })
    }

    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
            error: 'A purchase order must contain at least one item.',
        })
    }

    if (items.length > 100) {
        return res.status(400).json({
            error: 'A purchase order cannot contain more than 100 items.',
        })
    }

    const cleanItems = []
    const productIds = new Set()

    for (const item of items) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
            return res.status(400).json({
                error: 'Each purchase order item must be an object.',
            })
        }

        const productId = Number(item.productId)
        const { quantity, unitCost } = item

        if (!Number.isSafeInteger(productId) || productId <= 0) {
            return res.status(400).json({
                error: 'Each item must have a valid product ID.',
            })
        }

        if (productIds.has(productId)) {
            return res.status(400).json({
                error: 'A product can appear only once in an order.',
            })
        }

        if (
            typeof quantity !== 'number' ||
            !Number.isFinite(quantity) ||
            quantity <= 0
        ) {
            return res.status(400).json({
                error: 'Ordered quantity must be a positive number.',
            })
        }

        if (
            typeof unitCost !== 'number' ||
            !Number.isFinite(unitCost) ||
            unitCost < 0
        ) {
            return res.status(400).json({
                error: 'Unit cost must be a valid non-negative number.',
            })
        }

        productIds.add(productId)
        cleanItems.push({ productId, quantity, unitCost })
    }

    try {
        const supplier = db
            .prepare(`
                SELECT id, is_active AS isActive
                FROM suppliers
                WHERE id = ?
            `)
            .get(supplierId)

        if (!supplier) {
            return res.status(404).json({
                error: 'Supplier not found.',
            })
        }

        if (!supplier.isActive) {
            return res.status(409).json({
                error: 'Cannot create an order for an inactive supplier.',
            })
        }

        const findProduct = db.prepare(
            'SELECT id FROM products WHERE id = ?',
        )

        for (const item of cleanItems) {
            if (!findProduct.get(item.productId)) {
                return res.status(404).json({
                    error: `Product ${item.productId} not found.`,
                })
            }
        }

        const createOrder = db.transaction(() => {
            const orderResult = db
                .prepare(`
                    INSERT INTO purchase_orders (supplier_id, notes)
                    VALUES (?, ?)
                `)
                .run(supplierId, notes)

            const orderId = Number(orderResult.lastInsertRowid)

            const insertItem = db.prepare(`
                INSERT INTO purchase_order_items (
                    purchase_order_id,
                    product_id,
                    ordered_quantity,
                    unit_cost
                )
                VALUES (?, ?, ?, ?)
            `)

            for (const item of cleanItems) {
                insertItem.run(
                    orderId,
                    item.productId,
                    item.quantity,
                    item.unitCost,
                )
            }

            return orderId
        })

        const orderId = createOrder()
        const order = getPurchaseOrderById(orderId)

        logEvent('info', 'purchase_order_created', {
            orderId,
            supplierId,
            itemCount: cleanItems.length,
        })

        return res.status(201).json(order)
    } catch (error) {
        logEvent('error', 'purchase_order_creation_failed', {
            errorName: error.name,
            errorCode: error.code || 'UNEXPECTED_ERROR',
        })

        return res.status(500).json({
            error: 'Failed to create purchase order.',
        })
    }
})

// Retrieve one purchase order by ID.
app.get('/api/purchase-orders/:id', (req, res) => {
    const id = Number(req.params.id)

    if (!Number.isSafeInteger(id) || id <= 0) {
        return res.status(400).json({
            error: 'Invalid purchase order ID.',
        })
    }

    try {
        const order = getPurchaseOrderById(id)

        if (!order) {
            return res.status(404).json({
                error: 'Purchase order not found.',
            })
        }

        return res.status(200).json(order)
    } catch (error) {
        logEvent('error', 'purchase_order_retrieval_failed', {
            errorName: error.name,
            errorCode: error.code || 'UNEXPECTED_ERROR',
        })

        return res.status(500).json({
            error: 'Failed to retrieve purchase order.',
        })
    }
})

// Update a purchase order's workflow status.
app.patch('/api/purchase-orders/:id/status', (req, res) => {
    const id = Number(req.params.id)
    const { status } = req.body ?? {}

    if (!Number.isSafeInteger(id) || id <= 0) {
        return res.status(400).json({
            error: 'Invalid purchase order ID.',
        })
    }

    if (!['ordered', 'cancelled'].includes(status)) {
        return res.status(400).json({
            error: 'Status must be ordered or cancelled.',
        })
    }

    try {
        const result = db.transaction(() => {
            const order = db
                .prepare(`
                    SELECT id, status
                    FROM purchase_orders
                    WHERE id = ?
                `)
                .get(id)

            if (!order) {
                return { error: 'not_found' }
            }

            // Repeating the current status is harmless.
            if (order.status === status) {
                return { orderId: id }
            }

            if (status === 'ordered') {
                if (order.status !== 'draft') {
                    return { error: 'invalid_transition' }
                }

                const itemCount = db
                    .prepare(`
                        SELECT COUNT(*) AS count
                        FROM purchase_order_items
                        WHERE purchase_order_id = ?
                    `)
                    .get(id).count

                if (itemCount === 0) {
                    return { error: 'empty_order' }
                }

                db.prepare(`
                    UPDATE purchase_orders
                    SET
                        status = 'ordered',
                        ordered_at = CURRENT_TIMESTAMP,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `).run(id)
            } else {
                // An order can only be cancelled before any stock is received.
                if (!['draft', 'ordered'].includes(order.status)) {
                    return { error: 'invalid_transition' }
                }

                const receivedQuantity = db
                    .prepare(`
                        SELECT COALESCE(
                            SUM(received_quantity),
                            0
                        ) AS quantity
                        FROM purchase_order_items
                        WHERE purchase_order_id = ?
                    `)
                    .get(id).quantity

                if (receivedQuantity > 0) {
                    return { error: 'already_received' }
                }

                db.prepare(`
                    UPDATE purchase_orders
                    SET
                        status = 'cancelled',
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `).run(id)
            }

            return { orderId: id }
        })()

        if (result.error === 'not_found') {
            return res.status(404).json({
                error: 'Purchase order not found.',
            })
        }

        if (result.error === 'empty_order') {
            return res.status(409).json({
                error: 'Cannot order a purchase order without items.',
            })
        }

        if (result.error === 'already_received') {
            return res.status(409).json({
                error: 'Cannot cancel an order after stock has been received.',
            })
        }

        if (result.error === 'invalid_transition') {
            return res.status(409).json({
                error: 'This purchase order status transition is not allowed.',
            })
        }

        const order = getPurchaseOrderById(id)

        logEvent('info', 'purchase_order_status_updated', {
            orderId: id,
            status: order.status,
        })

        return res.status(200).json(order)
    } catch (error) {
        logEvent('error', 'purchase_order_status_update_failed', {
            errorName: error.name,
            errorCode: error.code || 'UNEXPECTED_ERROR',
        })

        return res.status(500).json({
            error: 'Failed to update purchase order status.',
        })
    }
})

// Receive some or all of the items in an ordered purchase order.
app.post('/api/purchase-orders/:id/receive', (req, res) => {
    const orderId = Number(req.params.id)
    const { items } = req.body ?? {}

    if (!Number.isSafeInteger(orderId) || orderId <= 0) {
        return res.status(400).json({
            error: 'Invalid purchase order ID.',
        })
    }

    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
            error: 'At least one item must be received.',
        })
    }

    if (items.length > 100) {
        return res.status(400).json({
            error: 'A single receipt cannot contain more than 100 items.',
        })
    }

    const cleanItems = []
    const seenItemIds = new Set()

    for (const item of items) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
            return res.status(400).json({
                error: 'Each received item must be an object.',
            })
        }

        const itemId = Number(item.itemId)
        const { quantity } = item

        if (!Number.isSafeInteger(itemId) || itemId <= 0) {
            return res.status(400).json({
                error: 'Each received item must have a valid item ID.',
            })
        }

        if (seenItemIds.has(itemId)) {
            return res.status(400).json({
                error: 'Each order item may appear only once per receipt.',
            })
        }

        if (
            typeof quantity !== 'number' ||
            !Number.isFinite(quantity) ||
            quantity <= 0
        ) {
            return res.status(400).json({
                error: 'Received quantity must be a positive number.',
            })
        }

        const rawExpirationDate = item.expirationDate
        const expirationDate =
            rawExpirationDate === undefined ||
                rawExpirationDate === null ||
                rawExpirationDate === ''
                ? null
                : rawExpirationDate

        if (
            expirationDate !== null &&
            !isValidDateOnly(expirationDate)
        ) {
            return res.status(400).json({
                error: 'Expiration date must be a valid date in YYYY-MM-DD format.',
            })
        }

        seenItemIds.add(itemId)
        cleanItems.push({
            itemId,
            quantity,
            expirationDate,
        })
    }

    try {
        const result = db.transaction(() => {
            const order = db
                .prepare(`
                    SELECT id, status
                    FROM purchase_orders
                    WHERE id = ?
                `)
                .get(orderId)

            if (!order) {
                return { error: 'order_not_found' }
            }

            if (
                !['ordered', 'partially_received'].includes(order.status)
            ) {
                return { error: 'invalid_status' }
            }

            const findOrderItem = db.prepare(`
                SELECT
                    id,
                    product_id AS productId,
                    ordered_quantity AS orderedQuantity,
                    received_quantity AS receivedQuantity
                FROM purchase_order_items
                WHERE id = ? AND purchase_order_id = ?
            `)

            const validatedItems = []

            // Validate every line before making any database changes.
            for (const item of cleanItems) {
                const orderItem = findOrderItem.get(
                    item.itemId,
                    orderId,
                )

                if (!orderItem) {
                    return { error: 'item_not_found' }
                }

                const remainingQuantity =
                    orderItem.orderedQuantity -
                    orderItem.receivedQuantity

                if (item.quantity > remainingQuantity) {
                    return {
                        error: 'excess_quantity',
                        itemId: item.itemId,
                        remainingQuantity,
                    }
                }

                validatedItems.push({
                    ...item,
                    productId: orderItem.productId,
                })
            }

            const insertBatch = db.prepare(`
                INSERT INTO inventory_batches (
                    product_id,
                    quantity_received,
                    quantity_remaining,
                    expiration_date
                )
                VALUES (?, ?, ?, ?)
            `)

            const updateOrderItem = db.prepare(`
                UPDATE purchase_order_items
                SET received_quantity = received_quantity + ?
                WHERE id = ?
                  AND received_quantity + ? <= ordered_quantity
            `)

            const insertMovement = db.prepare(`
                INSERT INTO inventory_movements (
                    product_id,
                    batch_id,
                    movement_type,
                    quantity_change
                )
                VALUES (?, ?, 'received', ?)
            `)

            const receivedItems = []

            for (const item of validatedItems) {
                const batchResult = insertBatch.run(
                    item.productId,
                    item.quantity,
                    item.quantity,
                    item.expirationDate,
                )

                const batchId = Number(batchResult.lastInsertRowid)

                const updateResult = updateOrderItem.run(
                    item.quantity,
                    item.itemId,
                    item.quantity,
                )

                if (updateResult.changes !== 1) {
                    throw new Error(
                        'Could not update the received purchase order quantity.',
                    )
                }

                insertMovement.run(
                    item.productId,
                    batchId,
                    item.quantity,
                )

                receivedItems.push({
                    itemId: item.itemId,
                    productId: item.productId,
                    batchId,
                    quantity: item.quantity,
                    expirationDate: item.expirationDate,
                })
            }

            const totals = db
                .prepare(`
                    SELECT
                        COUNT(*) AS totalItems,
                        SUM(
                            CASE
                                WHEN received_quantity < ordered_quantity
                                THEN 1
                                ELSE 0
                            END
                        ) AS remainingItems
                    FROM purchase_order_items
                    WHERE purchase_order_id = ?
                `)
                .get(orderId)

            const newStatus =
                totals.remainingItems > 0
                    ? 'partially_received'
                    : 'received'

            db.prepare(`
                UPDATE purchase_orders
                SET
                    status = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(newStatus, orderId)

            return { receivedItems }
        })()

        if (result.error === 'order_not_found') {
            return res.status(404).json({
                error: 'Purchase order not found.',
            })
        }

        if (result.error === 'invalid_status') {
            return res.status(409).json({
                error: 'Only ordered or partially received orders can receive stock.',
            })
        }

        if (result.error === 'item_not_found') {
            return res.status(404).json({
                error: 'An item was not found in this purchase order.',
            })
        }

        if (result.error === 'excess_quantity') {
            return res.status(409).json({
                error: 'Received quantity exceeds the remaining ordered quantity.',
                itemId: result.itemId,
                remainingQuantity: result.remainingQuantity,
            })
        }

        const order = getPurchaseOrderById(orderId)

        logEvent('info', 'purchase_order_stock_received', {
            orderId,
            itemCount: result.receivedItems.length,
            totalQuantity: result.receivedItems.reduce(
                (total, item) => total + item.quantity,
                0,
            ),
            status: order.status,
        })

        return res.status(200).json({
            ...order,
            receivedItems: result.receivedItems,
        })
    } catch (error) {
        logEvent('error', 'purchase_order_stock_receipt_failed', {
            errorName: error.name,
            errorCode: error.code || 'UNEXPECTED_ERROR',
        })

        return res.status(500).json({
            error: 'Failed to receive purchase order stock.',
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
