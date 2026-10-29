const { test } = require('node:test')
const assert = require('node:assert/strict')
const { isValidDateOnly } = require('../utils/validation')

test('isValidDateOnly accepts a valid date', () => {
    assert.equal(isValidDateOnly('2026-10-29'), true)
})

test('isValidDateOnly accepts a valid leap day', () => {
    assert.equal(isValidDateOnly('2024-02-29'), true)
})

test('isValidDateOnly rejects an impossible date', () => {
    assert.equal(isValidDateOnly('2026-02-30'), false)
})

test('isValidDateOnly rejects a leap day in a non-leap year', () => {
    assert.equal(isValidDateOnly('2026-02-29'), false)
})

test('isValidDateOnly rejects an invalid month', () => {
    assert.equal(isValidDateOnly('2026-13-01'), false)
})

test('isValidDateOnly rejects an invalid format', () => {
    assert.equal(isValidDateOnly('29-10-2026'), false)
    assert.equal(isValidDateOnly('2026-2-09'), false)
})

test('isValidDateOnly rejects missing and non-string values', () => {
    assert.equal(isValidDateOnly(''), false)
    assert.equal(isValidDateOnly(null), false)
    assert.equal(isValidDateOnly(undefined), false)
    assert.equal(isValidDateOnly(20261029), false)
})