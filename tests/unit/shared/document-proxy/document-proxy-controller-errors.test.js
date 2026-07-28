'use strict';

/**
 * tests/unit/shared/document-proxy/document-proxy-controller-errors.test.js
 *
 * Unit tests for document-proxy.controller.js.
 * The service is stubbed so the controller is tested as an HTTP adapter only.
 */

const test   = require('node:test');
const assert = require('node:assert/strict');
const { mock } = require('node:test');
const { Readable } = require('node:stream');

process.env.AWS_REGION            = 'ap-south-1';
process.env.AWS_S3_BUCKET_NAME    = 'test-bucket';
process.env.AWS_ACCESS_KEY_ID     = 'test-key';
process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';

const service    = require('../../../../src/modules/shared/document-proxy/document-proxy.service.js');
const errors     = require('../../../../src/modules/shared/document-proxy/document-proxy.errors.js');
const controller = require('../../../../src/modules/shared/document-proxy/document-proxy.controller.js');

/** Build a minimal Express-style mock response object */
const makeRes = () => {
    const headers = {};
    const res = {
        _status:  null,
        _body:    null,
        _piped:   false,
        headers,
        status(code) { this._status = code; return this; },
        json(body)  { this._body   = body; return this; },
        setHeader(name, val) { headers[name.toLowerCase()] = val; },
    };
    return res;
};

/** Build a minimal req mock with query.key */
const makeReq = (key) => ({ query: { key } });

test('document-proxy controller — errors', async (t) => {
    t.afterEach(() => mock.restoreAll());

    await t.test('1. returns 400 when service signals MISSING_KEY', async () => {
        mock.method(service, 'resolveDocument', async () => ({
            ok: false, status: 400,
            body: { success: false, message: 'Missing required query parameter: key' },
            errorCode: errors.MISSING_KEY,
        }));

        const req = makeReq(undefined);
        const res = makeRes();
        await controller.viewDocument(req, res);

        assert.equal(res._status, 400);
        assert.equal(res._body.success, false);
        assert.equal(res._body.message, 'Missing required query parameter: key');
    });

    await t.test('6. returns 403 body with debug_key_start when BLOCKED_PREFIX', async () => {
        mock.method(service, 'resolveDocument', async () => ({
            ok: false, status: 403,
            errorCode: errors.BLOCKED_PREFIX,
            body: {
                success: false,
                message: 'Access denied: key path is not permitted.',
                debug_key_start: 'private/s',
            },
        }));

        const req = makeReq('private/secret.pdf');
        const res = makeRes();
        await controller.viewDocument(req, res);

        assert.equal(res._status, 403);
        assert.equal(res._body.debug_key_start, 'private/s');
    });

    await t.test('14. 404 body is returned as-is', async () => {
        mock.method(service, 'resolveDocument', async () => ({
            ok: false, status: 404,
            errorCode: errors.NOT_FOUND,
            body: {
                success: false,
                message: 'Document not found. It may have been deleted or the key is incorrect.',
                debug_key: 'owners/x/missing.pdf',
            },
        }));

        const req = makeReq('owners/x/missing.pdf');
        const res = makeRes();
        await controller.viewDocument(req, res);

        assert.equal(res._status, 404);
        assert.equal(res._body.message, 'Document not found. It may have been deleted or the key is incorrect.');
        assert.ok('debug_key' in res._body);
    });

    await t.test('15. 500 body is returned as-is', async () => {
        mock.method(service, 'resolveDocument', async () => ({
            ok: false, status: 500,
            errorCode: errors.UNEXPECTED,
            body: { success: false, message: 'Failed to retrieve document.' },
        }));

        const req = makeReq('owners/x/doc.pdf');
        const res = makeRes();
        await controller.viewDocument(req, res);

        assert.equal(res._status, 500);
        assert.equal(res._body.message, 'Failed to retrieve document.');
    });
});
