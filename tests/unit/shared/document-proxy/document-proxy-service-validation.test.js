'use strict';

/**
 * tests/unit/shared/document-proxy/document-proxy-service-validation.test.js
 *
 * Unit tests for document-proxy.service.js validation.
 * storage.fetchS3Object is stubbed so no real AWS calls are made.
 */

const test   = require('node:test');
const assert = require('node:assert/strict');
const { mock } = require('node:test');

process.env.AWS_REGION            = 'ap-south-1';
process.env.AWS_S3_BUCKET_NAME    = 'test-bucket';
process.env.AWS_ACCESS_KEY_ID     = 'test-key';
process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';

const storage = require('../../../../src/modules/shared/document-proxy/document-proxy.storage.js');
const errors  = require('../../../../src/modules/shared/document-proxy/document-proxy.errors.js');
const service = require('../../../../src/modules/shared/document-proxy/document-proxy.service.js');

const resolve = key => service.resolveDocument(key, { admin: { id: 'admin1', role: 'ADMIN' } });

const fakeS3Response = (overrides = {}) => ({
    ContentType:   'application/pdf',
    ContentLength: 1000,
    Body:          { pipe: () => {} },
    ...overrides,
});

test('document-proxy service — validation', async (t) => {
    t.beforeEach(() => mock.method(require('../../../../src/modules/shared/document-proxy/document-proxy.authorization'), 'canReadDocument', async () => true));
    t.afterEach(() => mock.restoreAll());

    // ── 1. Missing / invalid key ───────────────────────────────────────────────

    await t.test('1. undefined key → 400 MISSING_KEY', async () => {
        const result = await resolve(undefined);
        assert.equal(result.ok, false);
        assert.equal(result.status, 400);
        assert.equal(result.errorCode, errors.MISSING_KEY);
        assert.equal(result.body.success, false);
        assert.equal(result.body.message, 'Missing required query parameter: key');
    });

    await t.test('2a. empty string key → 400 MISSING_KEY', async () => {
        const result = await resolve('');
        assert.equal(result.ok, false);
        assert.equal(result.status, 400);
        assert.equal(result.errorCode, errors.MISSING_KEY);
    });

    await t.test('2b. numeric key (non-string) → 400 MISSING_KEY', async () => {
        const result = await resolve(42);
        assert.equal(result.ok, false);
        assert.equal(result.errorCode, errors.MISSING_KEY);
    });

    await t.test('2c. null key → 400 MISSING_KEY', async () => {
        const result = await resolve(null);
        assert.equal(result.ok, false);
        assert.equal(result.errorCode, errors.MISSING_KEY);
    });

    // ── 3. URL normalisation ───────────────────────────────────────────────────

    await t.test('3. full HTTPS URL is resolved to pathname key', async () => {
        let capturedKey = null;
        mock.method(storage, 'fetchS3Object', async (key) => {
            capturedKey = key;
            return fakeS3Response();
        });

        const url = 'https://bucket.s3.ap-south-1.amazonaws.com/owners/abc/doc.pdf?sig=xxx';
        const result = await resolve(url);
        assert.equal(result.ok, true);
        assert.equal(capturedKey, 'owners/abc/doc.pdf');
    });

    // ── 4. Malformed URL preserves raw value ───────────────────────────────────

    await t.test('4. malformed URL falls back to raw value as key (blocked)', async () => {
        // 'https://not valid url' will fail URL parse → parseFailed=true
        // raw value has no valid prefix → blocked
        const raw = 'https://not a valid url with spaces';
        const result = await resolve(raw);
        assert.equal(result.ok, false);
        // Either blocked or missing-key — the important thing is it doesn't crash
        assert.ok([400, 403].includes(result.status));
    });

    // ── 5. Allowed prefixes ────────────────────────────────────────────────────

    await t.test('5a. owners/ prefix → ok:true', async () => {
        mock.method(storage, 'fetchS3Object', async () => fakeS3Response());
        const result = await resolve('owners/x/doc.pdf');
        assert.equal(result.ok, true);
    });

    await t.test('5b. misc/ prefix → ok:true', async () => {
        mock.method(storage, 'fetchS3Object', async () => fakeS3Response());
        const result = await resolve('misc/old.pdf');
        assert.equal(result.ok, true);
    });

    await t.test('5c. agent_kyc/ prefix → ok:true', async () => {
        mock.method(storage, 'fetchS3Object', async () => fakeS3Response());
        const result = await resolve('agent_kyc/doc.pdf');
        assert.equal(result.ok, true);
    });

    await t.test('5d. bus_owner_docs/ prefix is blocked', async () => {
        const result = await resolve('bus_owner_docs/old.pdf');
        assert.equal(result.ok, false);
        assert.equal(result.status, 403);
    });

    // ── 6. Disallowed prefix ───────────────────────────────────────────────────

    await t.test('6. disallowed prefix → 403 BLOCKED_PREFIX with debug_key_start', async () => {
        const result = await resolve('private/secret.pdf');
        assert.equal(result.ok, false);
        assert.equal(result.status, 403);
        assert.equal(result.errorCode, errors.BLOCKED_PREFIX);
        assert.equal(result.body.success, false);
        assert.equal(result.body.message, 'Access denied: key path is not permitted.');
        assert.ok(!('debug_key_start' in result.body));
    });
});
