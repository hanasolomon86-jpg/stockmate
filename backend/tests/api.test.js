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