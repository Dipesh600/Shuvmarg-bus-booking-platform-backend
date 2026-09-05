'use strict';

/**
 * tests/unit/shared/document-proxy/document-proxy-service-s3.test.js
 *
 * Unit tests for document-proxy.service.js S3 interaction.
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

test('document-proxy service — s3 interaction', async (t) => {
    t.beforeEach(() => mock.method(require('../../../../src/modules/shared/document-proxy/document-proxy.authorization'), 'canReadDocument', async () => true));
    t.afterEach(() => mock.restoreAll());

    // ── 7. S3 bucket and key ───────────────────────────────────────────────────

    await t.test('7. fetchS3Object is called with exact resolved key', async () => {
        let calledWith = null;
        mock.method(storage, 'fetchS3Object', async (key) => {
            calledWith = key;
            return fakeS3Response();
        });

        await resolve('agents/abc/id.jpg');
        assert.equal(calledWith, 'agents/abc/id.jpg');
    });

    // ── 8–12. S3 response forwarding ──────────────────────────────────────────

    await t.test('8. s3Response contains ContentType from S3', async () => {
        mock.method(storage, 'fetchS3Object', async () => fakeS3Response({ ContentType: 'image/png' }));
        const result = await resolve('owners/x/img.png');
        assert.equal(result.s3Response.ContentType, 'image/png');
    });

    await t.test('9. missing ContentType in S3 response is preserved (caller uses fallback)', async () => {
        mock.method(storage, 'fetchS3Object', async () => fakeS3Response({ ContentType: undefined }));
        const result = await resolve('owners/x/doc');
        assert.ok(result.ok);
        assert.equal(result.s3Response.ContentType, undefined);
    });

    await t.test('11. ContentLength is present when S3 provides it', async () => {
        mock.method(storage, 'fetchS3Object', async () => fakeS3Response({ ContentLength: 2048 }));
        const result = await resolve('owners/x/doc.pdf');
        assert.equal(result.s3Response.ContentLength, 2048);
    });

    await t.test('11b. ContentLength is absent when S3 does not provide it', async () => {
        mock.method(storage, 'fetchS3Object', async () => ({ Body: { pipe: () => {} } }));
        const result = await resolve('owners/x/doc.pdf');
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
        const result = await resolve('owners/x/missing.pdf');
        assert.equal(result.ok, false);
        assert.equal(result.status, 404);
        assert.equal(result.errorCode, errors.NOT_FOUND);
        assert.equal(result.body.success, false);
        assert.equal(result.body.message, 'Document not found. It may have been deleted or the key is incorrect.');
        assert.ok(!('debug_key' in result.body));
    });

    await t.test('14b. S3 404 via httpStatusCode → 404 NOT_FOUND', async () => {
        mock.method(storage, 'fetchS3Object', async () => {
            const err = new Error('404');
            err.$metadata = { httpStatusCode: 404 };
            throw err;
        });
        const result = await resolve('owners/x/doc.pdf');
        assert.equal(result.status, 404);
        assert.equal(result.errorCode, errors.NOT_FOUND);
    });

    await t.test('15. unexpected S3 error → 500 UNEXPECTED', async () => {
        mock.method(storage, 'fetchS3Object', async () => {
            throw new Error('Network timeout');
        });
        const result = await resolve('owners/x/doc.pdf');
        assert.equal(result.ok, false);
        assert.equal(result.status, 500);
        assert.equal(result.errorCode, errors.UNEXPECTED);
        assert.equal(result.body.success, false);
        assert.equal(result.body.message, 'Failed to retrieve document.');
    });
});
