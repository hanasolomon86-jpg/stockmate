const { test, after } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const request = require('supertest')

// Use a separate temporary database for tests.
const testDatabasePath = path.join(
    os.tmpdir(),
    `stockmate-test-${process.pid}.db`,
)

// Set the database path before loading the application.
process.env.STOCKMATE_DB_PATH = testDatabasePath

const app = require('../app')
const db = require('../database')

// Close the test database and remove its files after testing.
after(() => {
    db.close()

    for (const suffix of ['', '-shm', '-wal']) {
        fs.rmSync(`${testDatabasePath}${suffix}`, {
            force: true,
        })
    }
})

test('StockMate API', async (t) => {
    await t.test('health endpoint returns a successful response', async () => {
        const response = await request(app)
            .get('/api/health')
            .expect(200)

        assert.equal(response.body.status, 'ok')
    })

    await t.test('default categories are available', async () => {
        const response = await request(app)
            .get('/api/categories')
            .expect(200)

        const categoryNames = response.body.map(
            (category) => category.name,
        )

        for (const name of [
            'Produce',
            'Dairy',
            'Bakery',
            'Pantry',
            'Frozen',
        ]) {
            assert.ok(
                categoryNames.includes(name),
                `Expected category "${name}" to exist`,
            )
        }
    })

    await t.test('product can be created and retrieved', async () => {
        const productData = {
            name: 'Test Tomatoes',
            category: 'Produce',
            unit: 'kg',
            salePrice: 8.9,
            minStock: 2,
            targetStock: 8,
            barcode: `TEST-PRODUCT-${process.pid}`,
        }

        const createResponse = await request(app)
            .post('/api/products')
            .send(productData)
            .expect(201)

        assert.equal(createResponse.body.name, productData.name)
        assert.equal(createResponse.body.salePrice, 8.9)
        assert.ok(createResponse.body.id)

        const listResponse = await request(app)
            .get('/api/products')
            .expect(200)

        assert.ok(
            listResponse.body.some(
                (product) => product.id === createResponse.body.id,
            ),
        )
    })

    await t.test('invalid product data is rejected', async () => {
        const response = await request(app)
            .post('/api/products')
            .send({
                name: '',
                category: 'Produce',
                unit: 'kg',
                salePrice: 8,
                minStock: 2,
                targetStock: 8,
            })
            .expect(400)

        assert.match(response.body.error, /required/i)
    })

    await t.test('duplicate product barcode is rejected', async () => {
        const barcode = `TEST-DUPLICATE-${process.pid}`

        const productData = {
            name: 'First Test Product',
            category: 'Pantry',
            unit: 'each',
            salePrice: 10,
            minStock: 1,
            targetStock: 5,
            barcode,
        }

        await request(app)
            .post('/api/products')
            .send(productData)
            .expect(201)

        const response = await request(app)
            .post('/api/products')
            .send({
                ...productData,
                name: 'Second Test Product',
            })
            .expect(409)

        assert.match(response.body.error, /barcode/i)
    })

    await t.test('existing product can be updated', async () => {
        const createResponse = await request(app)
            .post('/api/products')
            .send({
                name: 'Product Before Update',
                category: 'Produce',
                unit: 'each',
                salePrice: 5,
                minStock: 1,
                targetStock: 4,
                barcode: `TEST-UPDATE-${process.pid}`,
            })
            .expect(201)

        const productId = createResponse.body.id

        const updateResponse = await request(app)
            .put(`/api/products/${productId}`)
            .send({
                name: 'Product After Update',
                category: 'Produce',
                unit: 'each',
                salePrice: 7.5,
                minStock: 2,
                targetStock: 6,
                barcode: `TEST-UPDATE-${process.pid}`,
            })
            .expect(200)

        assert.equal(updateResponse.body.name, 'Product After Update')
        assert.equal(updateResponse.body.salePrice, 7.5)
        assert.equal(updateResponse.body.minStock, 2)
    })

    await t.test('product can be deleted', async () => {
        const createResponse = await request(app)
            .post('/api/products')
            .send({
                name: 'Product To Delete',
                category: 'Pantry',
                unit: 'each',
                salePrice: 3,
                minStock: 0,
                targetStock: 2,
                barcode: `TEST-DELETE-${process.pid}`,
            })
            .expect(201)

        const productId = createResponse.body.id

        await request(app)
            .delete(`/api/products/${productId}`)
            .expect(200)

        const listResponse = await request(app)
            .get('/api/products')
            .expect(200)

        assert.ok(
            !listResponse.body.some(
                (product) => product.id === productId,
            ),
        )
    })
    await t.test('invalid product and category IDs are rejected', async () => {
        await request(app)
            .put('/api/products/not-a-number')
            .send({})
            .expect(400)

        await request(app)
            .delete('/api/products/not-a-number')
            .expect(400)

        await request(app)
            .put('/api/categories/not-a-number')
            .send({ name: 'Updated Category' })
            .expect(400)

        await request(app)
            .delete('/api/categories/not-a-number')
            .expect(400)

        await request(app)
            .put('/api/products/9007199254740992')
            .send({})
            .expect(400)

        await request(app)
            .delete('/api/products/9007199254740992')
            .expect(400)

        await request(app)
            .put('/api/categories/9007199254740992')
            .send({ name: 'Updated Category' })
            .expect(400)

        await request(app)
            .delete('/api/categories/9007199254740992')
            .expect(400)
    })

    await t.test('inventory can be received and retrieved', async () => {
        const productResponse = await request(app)
            .post('/api/products')
            .send({
                name: 'Milk for Inventory Test',
                category: 'Dairy',
                unit: 'liter',
                salePrice: 6,
                minStock: 2,
                targetStock: 10,
                barcode: `TEST-INVENTORY-${process.pid}`,
            })
            .expect(201)

        const productId = productResponse.body.id

        const receiveResponse = await request(app)
            .post(`/api/products/${productId}/inventory-batches`)
            .send({
                quantity: 12,
                expirationDate: '2026-11-08',
            })
            .expect(201)

        assert.equal(receiveResponse.body.productId, productId)
        assert.equal(receiveResponse.body.quantityReceived, 12)
        assert.equal(receiveResponse.body.quantityRemaining, 12)
        assert.equal(receiveResponse.body.expirationDate, '2026-11-08')

        const batchesResponse = await request(app)
            .get(`/api/products/${productId}/inventory-batches`)
            .expect(200)

        assert.equal(batchesResponse.body.length, 1)
        assert.equal(batchesResponse.body[0].quantityRemaining, 12)

        const deleteResponse = await request(app)
            .delete(`/api/products/${productId}`)
            .expect(409)

        assert.match(
            deleteResponse.body.error,
            /inventory batches/i,
        )
    })

    await t.test('sales reduce inventory and reject insufficient stock', async () => {
        const productResponse = await request(app)
            .post('/api/products')
            .send({
                name: 'Milk for Sales Test',
                category: 'Dairy',
                unit: 'liter',
                salePrice: 6,
                minStock: 1,
                targetStock: 10,
                barcode: `TEST-SALES-${process.pid}`,
            })
            .expect(201)

        const productId = productResponse.body.id

        await request(app)
            .post(`/api/products/${productId}/inventory-batches`)
            .send({
                quantity: 5,
                expirationDate: '2026-11-08',
            })
            .expect(201)

        await request(app)
            .post(`/api/products/${productId}/inventory-batches`)
            .send({
                quantity: 4,
                expirationDate: '2026-11-03',
            })
            .expect(201)

        const saleResponse = await request(app)
            .post(`/api/products/${productId}/sales`)
            .send({ quantity: 6 })
            .expect(201)

        assert.equal(saleResponse.body.quantitySold, 6)
        assert.equal(saleResponse.body.currentStock, 3)

        const batchesResponse = await request(app)
            .get(`/api/products/${productId}/inventory-batches`)
            .expect(200)

        assert.equal(batchesResponse.body[0].expirationDate, '2026-11-03')
        assert.equal(batchesResponse.body[0].quantityRemaining, 0)
        assert.equal(batchesResponse.body[1].quantityRemaining, 3)

        const excessiveSale = await request(app)
            .post(`/api/products/${productId}/sales`)
            .send({ quantity: 4 })
            .expect(409)

        assert.equal(excessiveSale.body.currentStock, 3)

        await request(app)
            .post(`/api/products/${productId}/sales`)
            .send({ quantity: 0 })
            .expect(400)

        const movements = db
            .prepare(`
                SELECT movement_type AS movementType,
                       quantity_change AS quantityChange
                FROM inventory_movements
                WHERE product_id = ?
                ORDER BY id ASC
            `)
            .all(productId)

        assert.deepEqual(
            movements.map((movement) => movement.movementType),
            ['received', 'received', 'sale', 'sale'],
        )

        assert.deepEqual(
            movements.map((movement) => movement.quantityChange),
            [5, 4, -4, -2],
        )
        const historyResponse = await request(app)
            .get(`/api/products/${productId}/inventory-movements`)
            .expect(200)

        assert.equal(historyResponse.body.length, 4)

        assert.ok(
            historyResponse.body.some(
                (movement) =>
                    movement.movementType === 'sale' &&
                    movement.quantityChange === -2,
            ),
        )

        assert.ok(
            historyResponse.body.some(
                (movement) =>
                    movement.movementType === 'received' &&
                    movement.quantityChange === 5,
            ),
        )
    })

    await t.test('invalid inventory requests are rejected', async () => {
        const productResponse = await request(app)
            .post('/api/products')
            .send({
                name: 'Invalid Inventory Test',
                category: 'Dairy',
                unit: 'liter',
                salePrice: 5,
                minStock: 1,
                targetStock: 5,
                barcode: `TEST-INVALID-INVENTORY-${process.pid}`,
            })
            .expect(201)

        const productId = productResponse.body.id

        await request(app)
            .post(`/api/products/${productId}/inventory-batches`)
            .send({ quantity: 0 })
            .expect(400)

        await request(app)
            .post(`/api/products/${productId}/inventory-batches`)
            .send({
                quantity: 5,
                expirationDate: '2026-02-30',
            })
            .expect(400)

        await request(app)
            .post('/api/products/999999/inventory-batches')
            .send({ quantity: 5 })
            .expect(404)

        const batchesResponse = await request(app)
            .get(`/api/products/${productId}/inventory-batches`)
            .expect(200)

        assert.equal(batchesResponse.body.length, 0)
    })

    await t.test(
        'expired and damaged inventory is recorded correctly',
        async () => {
            const productResponse = await request(app)
                .post('/api/products')
                .send({
                    name: 'Product for Disposition Test',
                    category: 'Dairy',
                    unit: 'liter',
                    salePrice: 6,
                    minStock: 1,
                    targetStock: 5,
                    barcode: `TEST-DISPOSITION-${process.pid}`,
                })
                .expect(201)

            const productId = productResponse.body.id

            await request(app)
                .post(`/api/products/${productId}/inventory-batches`)
                .send({
                    quantity: 5,
                    expirationDate: '2026-11-08',
                })
                .expect(201)

            const batchesResponse = await request(app)
                .get(`/api/products/${productId}/inventory-batches`)
                .expect(200)

            const batchId = batchesResponse.body[0].id

            // Record expired products transferred to disposal.
            const expiredResponse = await request(app)
                .post(
                    `/api/products/${productId}/inventory-batches/${batchId}/dispositions`,
                )
                .send({
                    quantity: 2,
                    reason: 'expired',
                    destination: 'disposal',
                })
                .expect(201)

            assert.equal(
                expiredResponse.body.disposition.reason,
                'expired',
            )
            assert.equal(
                expiredResponse.body.disposition.destination,
                'disposal',
            )
            assert.equal(
                expiredResponse.body.disposition.quantity,
                2,
            )
            assert.equal(expiredResponse.body.currentStock, 3)

            // Record damaged products transferred to returns.
            const damagedResponse = await request(app)
                .post(
                    `/api/products/${productId}/inventory-batches/${batchId}/dispositions`,
                )
                .send({
                    quantity: 1,
                    reason: 'damaged',
                    destination: 'returns',
                })
                .expect(201)

            assert.equal(
                damagedResponse.body.disposition.reason,
                'damaged',
            )
            assert.equal(
                damagedResponse.body.disposition.destination,
                'returns',
            )
            assert.equal(damagedResponse.body.currentStock, 2)

            // Reject a disposition larger than the remaining stock.
            const excessiveResponse = await request(app)
                .post(
                    `/api/products/${productId}/inventory-batches/${batchId}/dispositions`,
                )
                .send({
                    quantity: 3,
                    reason: 'expired',
                    destination: 'disposal',
                })
                .expect(409)

            assert.equal(excessiveResponse.body.availableQuantity, 2)

            // Verify that the disposition records were preserved.
            const dispositionsResponse = await request(app)
                .get(`/api/products/${productId}/inventory-dispositions`)
                .expect(200)

            assert.equal(dispositionsResponse.body.length, 2)

            assert.ok(
                dispositionsResponse.body.some(
                    (item) =>
                        item.reason === 'expired' &&
                        item.destination === 'disposal' &&
                        item.quantity === 2,
                ),
            )

            assert.ok(
                dispositionsResponse.body.some(
                    (item) =>
                        item.reason === 'damaged' &&
                        item.destination === 'returns' &&
                        item.quantity === 1,
                ),
            )

            // Verify the stock movement history.
            const movementsResponse = await request(app)
                .get(`/api/products/${productId}/inventory-movements`)
                .expect(200)

            assert.deepEqual(
                movementsResponse.body
                    .map((movement) => movement.movementType)
                    .sort(),
                ['damaged', 'expired', 'received'],
            )

            assert.ok(
                movementsResponse.body.some(
                    (movement) =>
                        movement.movementType === 'expired' &&
                        movement.quantityChange === -2,
                ),
            )

            assert.ok(
                movementsResponse.body.some(
                    (movement) =>
                        movement.movementType === 'damaged' &&
                        movement.quantityChange === -1,
                ),
            )

            // Confirm that the available stock is still correct.
            const productsResponse = await request(app)
                .get('/api/products')
                .expect(200)

            const updatedProduct = productsResponse.body.find(
                (product) => product.id === productId,
            )

            assert.equal(updatedProduct.currentStock, 2)

            // Invalid disposition reasons must be rejected.
            await request(app)
                .post(
                    `/api/products/${productId}/inventory-batches/${batchId}/dispositions`,
                )
                .send({
                    quantity: 1,
                    reason: 'unknown',
                    destination: 'disposal',
                })
                .expect(400)
        },
    )

    await t.test(
        'suppliers can be created, retrieved, and updated',
        async () => {
            const supplierName = `Test Supplier ${process.pid}`

            const supplierData = {
                name: supplierName,
                contactName: 'Test Contact',
                phone: '0501234567',
                email: 'supplier@example.com',
                notes: 'Test supplier notes',
            }

            // Create a supplier.
            const createResponse = await request(app)
                .post('/api/suppliers')
                .send(supplierData)
                .expect(201)

            const supplierId = createResponse.body.id

            assert.ok(supplierId)
            assert.equal(createResponse.body.name, supplierName)
            assert.equal(
                createResponse.body.contactName,
                supplierData.contactName,
            )
            assert.equal(createResponse.body.email, supplierData.email)
            assert.equal(createResponse.body.isActive, 1)

            // Retrieve suppliers and confirm the supplier exists.
            const listResponse = await request(app)
                .get('/api/suppliers')
                .expect(200)

            assert.ok(
                listResponse.body.some(
                    (supplier) => supplier.id === supplierId,
                ),
            )

            // Reject a duplicate supplier name.
            await request(app)
                .post('/api/suppliers')
                .send({
                    ...supplierData,
                    name: supplierName.toUpperCase(),
                })
                .expect(409)

            // Reject invalid email addresses.
            const invalidEmailResponse = await request(app)
                .post('/api/suppliers')
                .send({
                    name: `Invalid Email Supplier ${process.pid}`,
                    email: 'not-an-email',
                })
                .expect(400)

            assert.match(invalidEmailResponse.body.error, /email/i)

            // Update the supplier and mark it inactive.
            const updateResponse = await request(app)
                .put(`/api/suppliers/${supplierId}`)
                .send({
                    name: supplierName,
                    contactName: 'Updated Contact',
                    phone: '0507654321',
                    email: 'updated@example.com',
                    notes: 'Updated notes',
                    isActive: false,
                })
                .expect(200)

            assert.equal(
                updateResponse.body.contactName,
                'Updated Contact',
            )
            assert.equal(
                updateResponse.body.phone,
                '0507654321',
            )
            assert.equal(
                updateResponse.body.email,
                'updated@example.com',
            )
            assert.equal(updateResponse.body.isActive, 0)

            // Invalid supplier IDs must be rejected.
            await request(app)
                .put('/api/suppliers/not-a-number')
                .send({
                    name: supplierName,
                })
                .expect(400)

            // Unknown supplier IDs must return 404.
            await request(app)
                .put('/api/suppliers/999999')
                .send({
                    name: supplierName,
                })
                .expect(404)
        },
    )

    await t.test(
        'purchase orders can be created and retrieved',
        async () => {
            // Create a supplier for the purchase order.
            const supplierResponse = await request(app)
                .post('/api/suppliers')
                .send({
                    name: `Purchase Order Supplier ${process.pid}`,
                    contactName: 'Test Contact',
                    email: 'purchase@example.com',
                })
                .expect(201)

            const supplierId = supplierResponse.body.id

            // Create a product to order.
            const productResponse = await request(app)
                .post('/api/products')
                .send({
                    name: 'Product for Purchase Order Test',
                    category: 'Pantry',
                    unit: 'each',
                    salePrice: 12,
                    minStock: 2,
                    targetStock: 10,
                    barcode: `TEST-PO-${process.pid}`,
                })
                .expect(201)

            const productId = productResponse.body.id

            // Create a purchase order with one item.
            const orderResponse = await request(app)
                .post('/api/purchase-orders')
                .send({
                    supplierId,
                    notes: 'Test purchase order',
                    items: [
                        {
                            productId,
                            quantity: 10,
                            unitCost: 7.5,
                        },
                    ],
                })
                .expect(201)

            const orderId = orderResponse.body.id

            assert.ok(orderId)
            assert.equal(orderResponse.body.supplierId, supplierId)
            assert.equal(
                orderResponse.body.supplierName,
                supplierResponse.body.name,
            )
            assert.equal(orderResponse.body.status, 'draft')
            assert.equal(orderResponse.body.notes, 'Test purchase order')

            assert.equal(orderResponse.body.items.length, 1)

            assert.equal(
                orderResponse.body.items[0].productId,
                productId,
            )
            assert.equal(
                orderResponse.body.items[0].productName,
                productResponse.body.name,
            )
            assert.equal(
                orderResponse.body.items[0].orderedQuantity,
                10,
            )
            assert.equal(
                orderResponse.body.items[0].receivedQuantity,
                0,
            )
            assert.equal(
                orderResponse.body.items[0].remainingQuantity,
                10,
            )
            assert.equal(orderResponse.body.items[0].unitCost, 7.5)

            // Retrieve the individual purchase order.
            const detailResponse = await request(app)
                .get(`/api/purchase-orders/${orderId}`)
                .expect(200)

            assert.equal(detailResponse.body.id, orderId)
            assert.equal(detailResponse.body.items.length, 1)

            // Confirm the order appears in the list.
            const listResponse = await request(app)
                .get('/api/purchase-orders')
                .expect(200)

            assert.ok(
                listResponse.body.some(
                    (order) => order.id === orderId,
                ),
            )

            // Reject an order without items.
            await request(app)
                .post('/api/purchase-orders')
                .send({
                    supplierId,
                    items: [],
                })
                .expect(400)

            // Reject an invalid order ID.
            await request(app)
                .get('/api/purchase-orders/not-a-number')
                .expect(400)

            // Reject an unknown order ID.
            await request(app)
                .get('/api/purchase-orders/999999')
                .expect(404)
        },
    )

    await t.test(
        'purchase order stock can be received partially and fully',
        async () => {
            // Create a supplier.
            const supplierResponse = await request(app)
                .post('/api/suppliers')
                .send({
                    name: `Receiving Test Supplier ${process.pid}`,
                    email: 'receiving@example.com',
                })
                .expect(201)

            const supplierId = supplierResponse.body.id

            // Create a product.
            const productResponse = await request(app)
                .post('/api/products')
                .send({
                    name: 'Product for Receiving Test',
                    category: 'Pantry',
                    unit: 'each',
                    salePrice: 15,
                    minStock: 2,
                    targetStock: 10,
                    barcode: `TEST-RECEIVING-${process.pid}`,
                })
                .expect(201)

            const productId = productResponse.body.id

            // Create a purchase order for 10 units.
            const createOrderResponse = await request(app)
                .post('/api/purchase-orders')
                .send({
                    supplierId,
                    items: [
                        {
                            productId,
                            quantity: 10,
                            unitCost: 8,
                        },
                    ],
                })
                .expect(201)

            const orderId = createOrderResponse.body.id
            const itemId = createOrderResponse.body.items[0].id

            assert.equal(createOrderResponse.body.status, 'draft')

            // A draft order cannot receive stock.
            await request(app)
                .post(`/api/purchase-orders/${orderId}/receive`)
                .send({
                    items: [{ itemId, quantity: 2 }],
                })
                .expect(409)

            // Mark the purchase order as ordered.
            const orderedResponse = await request(app)
                .patch(`/api/purchase-orders/${orderId}/status`)
                .send({ status: 'ordered' })
                .expect(200)

            assert.equal(orderedResponse.body.status, 'ordered')

            // Receive 4 units first.
            const partialResponse = await request(app)
                .post(`/api/purchase-orders/${orderId}/receive`)
                .send({
                    items: [
                        {
                            itemId,
                            quantity: 4,
                            expirationDate: '2026-11-12',
                        },
                    ],
                })
                .expect(200)

            assert.equal(
                partialResponse.body.status,
                'partially_received',
            )
            assert.equal(
                partialResponse.body.items[0].receivedQuantity,
                4,
            )
            assert.equal(
                partialResponse.body.items[0].remainingQuantity,
                6,
            )
            assert.equal(
                partialResponse.body.receivedItems[0].quantity,
                4,
            )

            // Reject a receipt exceeding the remaining 6 units.
            const excessiveResponse = await request(app)
                .post(`/api/purchase-orders/${orderId}/receive`)
                .send({
                    items: [{ itemId, quantity: 7 }],
                })
                .expect(409)

            assert.equal(
                excessiveResponse.body.remainingQuantity,
                6,
            )

            // The failed receipt must not change the received quantity or stock.
            const afterExcessResponse = await request(app)
                .get(`/api/products/${productId}/inventory-batches`)
                .expect(200)

            assert.equal(afterExcessResponse.body.length, 1)
            assert.equal(
                afterExcessResponse.body[0].quantityRemaining,
                4,
            )

            // Receive the remaining 6 units.
            const completeResponse = await request(app)
                .post(`/api/purchase-orders/${orderId}/receive`)
                .send({
                    items: [
                        {
                            itemId,
                            quantity: 6,
                            expirationDate: '2026-11-18',
                        },
                    ],
                })
                .expect(200)

            assert.equal(completeResponse.body.status, 'received')
            assert.equal(
                completeResponse.body.items[0].receivedQuantity,
                10,
            )
            assert.equal(
                completeResponse.body.items[0].remainingQuantity,
                0,
            )

            // The total available stock should now be 10.
            const productsResponse = await request(app)
                .get('/api/products')
                .expect(200)

            const updatedProduct = productsResponse.body.find(
                (product) => product.id === productId,
            )

            assert.equal(updatedProduct.currentStock, 10)

            // Check that each successful receipt was recorded in history.
            const movementsResponse = await request(app)
                .get(`/api/products/${productId}/inventory-movements`)
                .expect(200)

            const receivedMovements = movementsResponse.body.filter(
                (movement) => movement.movementType === 'received',
            )

            assert.equal(receivedMovements.length, 2)

            assert.equal(
                receivedMovements.reduce(
                    (total, movement) => total + movement.quantityChange,
                    0,
                ),
                10,
            )

            // Once fully received, the order cannot be cancelled.
            await request(app)
                .patch(`/api/purchase-orders/${orderId}/status`)
                .send({ status: 'cancelled' })
                .expect(409)
        },
    )

    await t.test(
        'low-stock alerts generate purchase order drafts only once',
        async () => {
            const supplierResponse = await request(app)
                .post('/api/suppliers')
                .send({
                    name: `Low Stock Supplier ${process.pid}`,
                    email: 'low-stock@example.com',
                })
                .expect(201)

            const supplierId = supplierResponse.body.id

            const productResponse = await request(app)
                .post('/api/products')
                .send({
                    name: 'Product for Low Stock Draft Test',
                    category: 'Pantry',
                    unit: 'each',
                    salePrice: 12,
                    minStock: 5,
                    targetStock: 12,
                    preferredSupplierId: supplierId,
                    purchaseUnitCost: 3,
                    barcode: `TEST-LOW-STOCK-${process.pid}`,
                })
                .expect(201)

            const productId = productResponse.body.id

            const alertsResponse = await request(app)
                .get('/api/stock-alerts')
                .expect(200)

            const alert = alertsResponse.body.find(
                (item) => item.id === productId,
            )

            assert.ok(alert, 'The product should appear in stock alerts.')
            assert.equal(alert.currentStock, 0)
            assert.equal(alert.recommendedQuantity, 12)
            assert.equal(alert.canGenerateDraft, true)

            const generateResponse = await request(app)
                .post('/api/stock-alerts/generate-drafts')
                .expect(201)

            assert.equal(generateResponse.body.createdOrderCount, 1)
            assert.equal(generateResponse.body.addedItemCount, 1)

            const generatedOrder =
                generateResponse.body.orders.find(
                    (order) =>
                        order.items.some(
                            (item) => item.productId === productId,
                        ),
                )

            assert.ok(generatedOrder)
            assert.equal(generatedOrder.status, 'draft')
            assert.equal(generatedOrder.supplierId, supplierId)

            const generatedItem = generatedOrder.items.find(
                (item) => item.productId === productId,
            )

            assert.equal(generatedItem.orderedQuantity, 12)
            assert.equal(generatedItem.unitCost, 3)
            assert.equal(generatedItem.receivedQuantity, 0)

            // Calling the generator again must not duplicate the draft item.
            const secondGenerateResponse = await request(app)
                .post('/api/stock-alerts/generate-drafts')
                .expect(200)

            assert.equal(
                secondGenerateResponse.body.createdOrderCount,
                0,
            )
            assert.equal(
                secondGenerateResponse.body.addedItemCount,
                0,
            )

            const orderAfterSecondCall = await request(app)
                .get(`/api/purchase-orders/${generatedOrder.id}`)
                .expect(200)

            assert.equal(orderAfterSecondCall.body.items.length, 1)
            assert.equal(
                orderAfterSecondCall.body.items[0].orderedQuantity,
                12,
            )

            // Generating a draft must not change the available inventory.
            const productsResponse = await request(app)
                .get('/api/products')
                .expect(200)

            const updatedProduct = productsResponse.body.find(
                (product) => product.id === productId,
            )

            assert.equal(updatedProduct.currentStock, 0)
        },
    )

    await t.test('duplicate category names are rejected', async () => {
        const categoryName = `Test Category ${process.pid}`

        await request(app)
            .post('/api/categories')
            .send({ name: categoryName })
            .expect(201)

        const response = await request(app)
            .post('/api/categories')
            .send({ name: categoryName.toLowerCase() })
            .expect(409)

        assert.match(response.body.error, /already exists/i)
    })
    await t.test('invalid stock levels are rejected', async () => {
        const negativePriceResponse = await request(app)
            .post('/api/products')
            .send({
                name: 'Invalid Price Product',
                category: 'Produce',
                unit: 'each',
                salePrice: -1,
                minStock: 1,
                targetStock: 5,
                barcode: `TEST-NEGATIVE-PRICE-${process.pid}`,
            })
            .expect(400)

        assert.match(negativePriceResponse.body.error, /sale price/i)

        const invalidStockResponse = await request(app)
            .post('/api/products')
            .send({
                name: 'Invalid Stock Product',
                category: 'Produce',
                unit: 'each',
                salePrice: 5,
                minStock: 5,
                targetStock: 2,
                barcode: `TEST-INVALID-STOCK-${process.pid}`,
            })
            .expect(400)

        assert.match(invalidStockResponse.body.error, /stock/i)
    })

    await t.test('renaming a category updates its products', async () => {
        const originalName = `Category Before Rename ${process.pid}`
        const newName = `Category After Rename ${process.pid}`

        const categoryResponse = await request(app)
            .post('/api/categories')
            .send({ name: originalName })
            .expect(201)

        const productResponse = await request(app)
            .post('/api/products')
            .send({
                name: 'Product In Renamed Category',
                category: originalName,
                unit: 'each',
                salePrice: 4,
                minStock: 1,
                targetStock: 3,
                barcode: `TEST-CATEGORY-RENAME-${process.pid}`,
            })
            .expect(201)

        const renamedCategoryResponse = await request(app)
            .put(`/api/categories/${categoryResponse.body.id}`)
            .send({ name: newName })
            .expect(200)

        assert.equal(renamedCategoryResponse.body.name, newName)

        const productsResponse = await request(app)
            .get('/api/products')
            .expect(200)

        const updatedProduct = productsResponse.body.find(
            (product) => product.id === productResponse.body.id,
        )

        assert.equal(updatedProduct.category, newName)
    })

    await t.test('unused category can be deleted', async () => {
        const categoryResponse = await request(app)
            .post('/api/categories')
            .send({ name: `Unused Category ${process.pid}` })
            .expect(201)

        const categoryId = categoryResponse.body.id

        await request(app)
            .delete(`/api/categories/${categoryId}`)
            .expect(200)

        const categoriesResponse = await request(app)
            .get('/api/categories')
            .expect(200)

        assert.ok(
            !categoriesResponse.body.some(
                (category) => category.id === categoryId,
            ),
        )
    })
    await t.test(
        'category deletion is blocked while products use it',
        async () => {
            const categoryName = `Protected Category ${process.pid}`

            const categoryResponse = await request(app)
                .post('/api/categories')
                .send({ name: categoryName })
                .expect(201)

            const categoryId = categoryResponse.body.id

            const productResponse = await request(app)
                .post('/api/products')
                .send({
                    name: 'Product In Protected Category',
                    category: categoryName,
                    unit: 'each',
                    salePrice: 4,
                    minStock: 1,
                    targetStock: 3,
                    barcode: `TEST-PROTECTED-${process.pid}`,
                })
                .expect(201)

            const deleteResponse = await request(app)
                .delete(`/api/categories/${categoryId}`)
                .expect(409)

            assert.match(deleteResponse.body.error, /assigned to products/i)

            // Remove the test product, then verify that the category can be deleted.
            await request(app)
                .delete(`/api/products/${productResponse.body.id}`)
                .expect(200)

            await request(app)
                .delete(`/api/categories/${categoryId}`)
                .expect(200)
        },
    )
})