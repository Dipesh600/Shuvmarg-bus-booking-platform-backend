'use strict';

/**
 * tests/unit/shared/document-proxy/document-proxy-errors.test.js
 *
 * Unit tests for document-proxy.errors.js — verifies the exported constants.
 */

const test   = require('node:test');
const assert = require('node:assert/strict');

const errors = require('../../../../src/modules/shared/document-proxy/document-proxy.errors.js');

test('document-proxy errors', async (t) => {

    await t.test('exports MISSING_KEY string constant', () => {
        assert.equal(typeof errors.MISSING_KEY, 'string');
        assert.ok(errors.MISSING_KEY.length > 0);
    });

    await t.test('exports BLOCKED_PREFIX string constant', () => {
        assert.equal(typeof errors.BLOCKED_PREFIX, 'string');
        assert.ok(errors.BLOCKED_PREFIX.length > 0);
    });

    await t.test('exports NOT_FOUND string constant', () => {
        assert.equal(typeof errors.NOT_FOUND, 'string');
        assert.ok(errors.NOT_FOUND.length > 0);
    });

    await t.test('exports UNEXPECTED string constant', () => {
        assert.equal(typeof errors.UNEXPECTED, 'string');
        assert.ok(errors.UNEXPECTED.length > 0);
    });

    await t.test('all four constants are distinct', () => {
        const vals = [errors.MISSING_KEY, errors.BLOCKED_PREFIX, errors.NOT_FOUND, errors.UNEXPECTED];
        const unique = new Set(vals);
        assert.equal(unique.size, 4);
    });
});
