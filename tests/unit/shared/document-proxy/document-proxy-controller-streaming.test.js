'use strict';

/**
 * tests/unit/shared/document-proxy/document-proxy-controller-streaming.test.js
 *
 * Unit tests for document-proxy.controller.js.
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

test('document-proxy controller — streaming', async (t) => {
    t.afterEach(() => mock.restoreAll());

    await t.test('8. Content-Type header is forwarded from s3Response', async () => {
        const stream = Readable.from([Buffer.from('data')]);
        stream.pipe = (dest) => { dest._piped = true; return dest; };
        mock.method(service, 'resolveDocument', async () => ({
            ok: true, resolvedKey: 'owners/x/doc.pdf',
            s3Response: { ContentType: 'image/jpeg', ContentLength: 50, Body: stream },
        }));

        const req = makeReq('owners/x/doc.pdf');
        const res = makeRes();
        res.pipe = () => {};
        await controller.viewDocument(req, res);

        assert.equal(res.headers['content-type'], 'image/jpeg');
    });

    await t.test('9. Content-Type falls back to application/octet-stream when absent', async () => {
        const stream = Readable.from([]);
        stream.pipe = () => {};
        mock.method(service, 'resolveDocument', async () => ({
            ok: true, resolvedKey: 'owners/x/doc',
            s3Response: { ContentType: undefined, Body: stream },
        }));

        const req = makeReq('owners/x/doc');
        const res = makeRes();
        await controller.viewDocument(req, res);

        assert.equal(res.headers['content-type'], 'application/octet-stream');
    });

    await t.test('10. Content-Disposition uses last key segment', async () => {
        const stream = Readable.from([]);
        stream.pipe = () => {};
        mock.method(service, 'resolveDocument', async () => ({
            ok: true, resolvedKey: 'owners/123/kyc/citizenship.pdf',
            s3Response: { ContentType: 'application/pdf', Body: stream },
        }));

        const req = makeReq('owners/123/kyc/citizenship.pdf');
        const res = makeRes();
        await controller.viewDocument(req, res);

        assert.ok(res.headers['content-disposition'].includes('citizenship.pdf'));
    });

    await t.test('11. Content-Length is set only when S3 provides it', async () => {
        const stream = Readable.from([]);
        stream.pipe = () => {};
        mock.method(service, 'resolveDocument', async () => ({
            ok: true, resolvedKey: 'owners/x/doc.pdf',
            s3Response: { ContentType: 'application/pdf', ContentLength: 8192, Body: stream },
        }));

        const req = makeReq('owners/x/doc.pdf');
        const res = makeRes();
        await controller.viewDocument(req, res);

        assert.equal(res.headers['content-length'], 8192);
    });

    await t.test('11b. Content-Length not set when absent from S3', async () => {
        const stream = Readable.from([]);
        stream.pipe = () => {};
        mock.method(service, 'resolveDocument', async () => ({
            ok: true, resolvedKey: 'owners/x/doc.pdf',
            s3Response: { ContentType: 'application/pdf', Body: stream },
        }));

        const req = makeReq('owners/x/doc.pdf');
        const res = makeRes();
        await controller.viewDocument(req, res);

        assert.equal(res.headers['content-length'], undefined);
    });

    await t.test('12. Cache-Control is always "private, no-store"', async () => {
        const stream = Readable.from([]);
        stream.pipe = () => {};
        mock.method(service, 'resolveDocument', async () => ({
            ok: true, resolvedKey: 'owners/x/doc.pdf',
            s3Response: { ContentType: 'application/pdf', Body: stream },
        }));

        const req = makeReq('owners/x/doc.pdf');
        const res = makeRes();
        await controller.viewDocument(req, res);

        assert.equal(res.headers['cache-control'], 'private, no-store');
    });

    await t.test('13. S3 body is piped to the response', async () => {
        let pipedTo = null;
        const stream = Readable.from([Buffer.from('hello')]);
        stream.pipe = (dest) => { pipedTo = dest; return dest; };

        mock.method(service, 'resolveDocument', async () => ({
            ok: true, resolvedKey: 'owners/x/doc.pdf',
            s3Response: { ContentType: 'application/pdf', Body: stream },
        }));

        const req = makeReq('owners/x/doc.pdf');
        const res = makeRes();
        await controller.viewDocument(req, res);

        assert.ok(pipedTo === res, 'Body.pipe was called with the response');
    });
});
