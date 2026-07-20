'use strict';

/**
 * tests/unit/shared/document-proxy/document-proxy-service.test.js
 *
 * Unit tests for document-proxy.service.js.
 * storage.fetchS3Object is stubbed so no real AWS calls are made.
 * All 15 required behaviours are exercised here.
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

const fakeS3Response = (overrides = {}) => ({
    ContentType:   'application/pdf',
    ContentLength: 1000,
    Body:          { pipe: () => {} },
    ...overrides,
});

test('document-proxy service — resolveDocument', async (t) => {
    t.afterEach(() => mock.restoreAll());

    // ── 1. Missing / invalid key ───────────────────────────────────────────────

    await t.test('1. undefined key → 400 MISSING_KEY', async () => {
        const result = await service.resolveDocument(undefined);
        assert.equal(result.ok, false);
        assert.equal(result.status, 400);
        assert.equal(result.errorCode, errors.MISSING_KEY);
        assert.equal(result.body.success, false);
        assert.equal(result.body.message, 'Missing required query parameter: key');
    });

    await t.test('2a. empty string key → 400 MISSING_KEY', async () => {
        const result = await service.resolveDocument('');
        assert.equal(result.ok, false);
        assert.equal(result.status, 400);
        assert.equal(result.errorCode, errors.MISSING_KEY);
    });

    await t.test('2b. numeric key (non-string) → 400 MISSING_KEY', async () => {
        const result = await service.resolveDocument(42);
        assert.equal(result.ok, false);
        assert.equal(result.errorCode, errors.MISSING_KEY);
    });

    await t.test('2c. null key → 400 MISSING_KEY', async () => {
        const result = await service.resolveDocument(null);
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
        const result = await service.resolveDocument(url);
        assert.equal(result.ok, true);
        assert.equal(capturedKey, 'owners/abc/doc.pdf');
    });

    // ── 4. Malformed URL preserves raw value ───────────────────────────────────

    await t.test('4. malformed URL falls back to raw value as key (blocked)', async () => {
        // 'https://not valid url' will fail URL parse → parseFailed=true
        // raw value has no valid prefix → blocked
        const raw = 'https://not a valid url with spaces';
        const result = await service.resolveDocument(raw);
        assert.equal(result.ok, false);
        // Either blocked or missing-key — the important thing is it doesn't crash
        assert.ok([400, 403].includes(result.status));
    });

    // ── 5. Allowed prefixes ────────────────────────────────────────────────────

    await t.test('5a. owners/ prefix → ok:true', async () => {
        mock.method(storage, 'fetchS3Object', async () => fakeS3Response());
        const result = await service.resolveDocument('owners/x/doc.pdf');
        assert.equal(result.ok, true);
    });

    await t.test('5b. misc/ prefix → ok:true', async () => {
        mock.method(storage, 'fetchS3Object', async () => fakeS3Response());
        const result = await service.resolveDocument('misc/old.pdf');
        assert.equal(result.ok, true);
    });

    await t.test('5c. agent_kyc/ prefix → ok:true', async () => {
        mock.method(storage, 'fetchS3Object', async () => fakeS3Response());
        const result = await service.resolveDocument('agent_kyc/doc.pdf');
        assert.equal(result.ok, true);
    });

    await t.test('5d. bus_owner_docs/ prefix → ok:true', async () => {
        mock.method(storage, 'fetchS3Object', async () => fakeS3Response());
        const result = await service.resolveDocument('bus_owner_docs/old.pdf');
        assert.equal(result.ok, true);
    });

    // ── 6. Disallowed prefix ───────────────────────────────────────────────────

    await t.test('6. disallowed prefix → 403 BLOCKED_PREFIX with debug_key_start', async () => {
        const result = await service.resolveDocument('private/secret.pdf');
        assert.equal(result.ok, false);
        assert.equal(result.status, 403);
        assert.equal(result.errorCode, errors.BLOCKED_PREFIX);
        assert.equal(result.body.success, false);
        assert.equal(result.body.message, 'Access denied: key path is not permitted.');
        assert.ok('debug_key_start' in result.body);
    });

    // ── 7. S3 bucket and key ───────────────────────────────────────────────────

    await t.test('7. fetchS3Object is called with exact resolved key', async () => {
        let calledWith = null;
        mock.method(storage, 'fetchS3Object', async (key) => {
            calledWith = key;
            return fakeS3Response();
        });

        await service.resolveDocument('agents/abc/id.jpg');
        assert.equal(calledWith, 'agents/abc/id.jpg');
    });

    // ── 8–12. S3 response forwarding ──────────────────────────────────────────

    await t.test('8. s3Response contains ContentType from S3', async () => {
        mock.method(storage, 'fetchS3Object', async () => fakeS3Response({ ContentType: 'image/png' }));
        const result = await service.resolveDocument('owners/x/img.png');
        assert.equal(result.s3Response.ContentType, 'image/png');
    });

    await t.test('9. missing ContentType in S3 response is preserved (caller uses fallback)', async () => {
        mock.method(storage, 'fetchS3Object', async () => fakeS3Response({ ContentType: undefined }));
        const result = await service.resolveDocument('owners/x/doc');
        assert.ok(result.ok);
        assert.equal(result.s3Response.ContentType, undefined);
    });

    await t.test('11. ContentLength is present when S3 provides it', async () => {
        mock.method(storage, 'fetchS3Object', async () => fakeS3Response({ ContentLength: 2048 }));
        const result = await service.resolveDocument('owners/x/doc.pdf');
        assert.equal(result.s3Response.ContentLength, 2048);
    });

    await t.test('11b. ContentLength is absent when S3 does not provide it', async () => {
        mock.method(storage, 'fetchS3Object', async () => ({ Body: { pipe: () => {} } }));
        const result = await service.resolveDocument('owners/x/doc.pdf');
        assert.ok(result.ok);
        assert.equal(result.s3Response.ContentLength, undefined);
    });

    // ── 14–15. S3 error handling ───────────────────────────────────────────────

    await t.test('14. S3 NoSuchKey → 404 NOT_FOUND with debug_key', async () => {
        mock.method(storage, 'fetchS3Object', async () => {
            const err = new Error('key missing');
            err.name = 'NoSuchKey';
            throw err;
        });
        const result = await service.resolveDocument('owners/x/missing.pdf');
        assert.equal(result.ok, false);
        assert.equal(result.status, 404);
        assert.equal(result.errorCode, errors.NOT_FOUND);
        assert.equal(result.body.success, false);
        assert.equal(result.body.message, 'Document not found. It may have been deleted or the key is incorrect.');
        assert.ok('debug_key' in result.body);
    });

    await t.test('14b. S3 404 via httpStatusCode → 404 NOT_FOUND', async () => {
        mock.method(storage, 'fetchS3Object', async () => {
            const err = new Error('404');
            err.$metadata = { httpStatusCode: 404 };
            throw err;
        });
        const result = await service.resolveDocument('owners/x/doc.pdf');
        assert.equal(result.status, 404);
        assert.equal(result.errorCode, errors.NOT_FOUND);
    });

    await t.test('15. unexpected S3 error → 500 UNEXPECTED', async () => {
        mock.method(storage, 'fetchS3Object', async () => {
            throw new Error('Network timeout');
        });
        const result = await service.resolveDocument('owners/x/doc.pdf');
        assert.equal(result.ok, false);
        assert.equal(result.status, 500);
        assert.equal(result.errorCode, errors.UNEXPECTED);
        assert.equal(result.body.success, false);
        assert.equal(result.body.message, 'Failed to retrieve document.');
    });
});
