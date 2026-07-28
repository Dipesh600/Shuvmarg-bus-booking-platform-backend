'use strict';

/**
 * tests/unit/shared/document-proxy/document-proxy-storage.test.js
 *
 * Unit tests for document-proxy.storage.js.
 * Tests verify that fetchS3Object passes the correct bucket and key to the
 * S3Client without making real network calls.
 */

const test   = require('node:test');
const assert = require('node:assert/strict');
const { mock } = require('node:test');

// Set env before requiring storage (S3Client reads them at module init)
process.env.AWS_REGION            = 'ap-south-1';
process.env.AWS_S3_BUCKET_NAME    = 'test-bucket';
process.env.AWS_ACCESS_KEY_ID     = 'test-key';
process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';

test('document-proxy storage — fetchS3Object', async (t) => {
    t.afterEach(() => mock.restoreAll());

    await t.test('7. S3 command uses exact bucket env var and resolved key', async () => {
        const { S3Client } = require('@aws-sdk/client-s3');
        let capturedInput = null;

        // Patch the send method on the prototype so we capture what command was built
        mock.method(S3Client.prototype, 'send', async (cmd) => {
            capturedInput = cmd.input;
            return { ContentType: 'application/pdf', Body: { pipe: () => {} } };
        });

        const storage = require('../../../../src/modules/shared/document-proxy/document-proxy.storage.js');
        await storage.fetchS3Object('owners/abc/kyc/doc.pdf');

        assert.equal(capturedInput.Bucket, 'test-bucket');
        assert.equal(capturedInput.Key,    'owners/abc/kyc/doc.pdf');
    });

    await t.test('7b. different key is forwarded verbatim', async () => {
        const { S3Client } = require('@aws-sdk/client-s3');
        let capturedKey = null;

        mock.method(S3Client.prototype, 'send', async (cmd) => {
            capturedKey = cmd.input.Key;
            return { Body: { pipe: () => {} } };
        });

        const storage = require('../../../../src/modules/shared/document-proxy/document-proxy.storage.js');
        await storage.fetchS3Object('agents/xyz/id.jpg');

        assert.equal(capturedKey, 'agents/xyz/id.jpg');
    });

    await t.test('propagates S3 errors to caller', async () => {
        const { S3Client } = require('@aws-sdk/client-s3');

        mock.method(S3Client.prototype, 'send', async () => {
            const err = new Error('NoSuchKey');
            err.name = 'NoSuchKey';
            throw err;
        });

        const storage = require('../../../../src/modules/shared/document-proxy/document-proxy.storage.js');
        await assert.rejects(
            () => storage.fetchS3Object('owners/missing/doc.pdf'),
            { name: 'NoSuchKey' },
        );
    });
});
