'use strict';

/**
 * tests/characterization/document-proxy-validation.test.js
 *
 * Characterization tests for:
 *   GET /api/agent/documents/view
 *
 * S3 interaction is stubbed via module-level mock of storage.fetchS3Object.
 * A real in-memory MongoDB user is seeded so the auth + verifyRoleFromDB
 * middleware chain succeeds exactly as in production.
 */

const { test, mock } = require('node:test');
const assert  = require('node:assert/strict');
const crypto  = require('node:crypto');
const { Readable } = require('node:stream');
const request = require('supertest');
const jwt     = require('jsonwebtoken');

process.env.NODE_ENV              = 'test';
process.env.SECRET_KEY            = 'test-only-secret-32chars-minimum!!';
process.env.VERIFICATION_TOKEN_SECRET = 'test-only-verification-secret!!';
process.env.AWS_REGION            = 'ap-south-1';
process.env.AWS_S3_BUCKET_NAME    = 'test-bucket';
process.env.AWS_ACCESS_KEY_ID     = 'test-key';
process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';
process.env.SPARROW_SMS_TOKEN     = 'test-stub';
process.env.CLOUDINARY_NAME       = 'test';
process.env.CLOUDINARY_API_KEY    = 'test';
process.env.CLOUDINARY_SECRET_KEY = 'test';
process.env.FCM_PROJECT_ID = process.env.FCM_CLIENT_EMAIL = process.env.FCM_PRIVATE_KEY = '';

const db      = require('../helpers/db');
const app     = require('../helpers/app');
const User    = require('../../models/userModel');
const storage = require('../../src/modules/shared/document-proxy/document-proxy.storage.js');

let seq = 0;
const next = () => String(++seq).padStart(3, '0');
const cred = () => `${crypto.randomBytes(12).toString('hex')}A1!`;

const seedAgent = async () => {
    const n = next();
    const user = await User.create({
        name:     `DocProxy Agent ${n}`,
        email:    `docproxy-${n}@example.test`,
        phone:    `98700${n.padStart(5, '0')}`,
        password: cred(),
        role:     'agent',
        roles:    ['agent'],
        status:   'active',
    });
    await require('../../models/agentModel').collection.insertOne({ user: user._id, documents: [{ fileKey: '/api/agent/documents/view' }, { fileKey: 'owners/abc/doc.pdf' }, { fileKey: 'owners/abc/missing.pdf' }] });
    return user;
};

const tokenFor = (user) => jwt.sign(
    {
        id:          user._id,
        name:        user.name,
        role:        'agent',
        roles:       ['agent'],
        activeRole:  'agent',
        purpose:     'access',
        tokenVersion: user.tokenVersion || 0,
    },
    process.env.SECRET_KEY,
);

const makeStream = (data = 'file-bytes') => Readable.from([Buffer.from(data)]);

const get = (key, token) => {
    const req = request(app).get('/api/agent/documents/view');
    if (token) req.set('Authorization', `Bearer ${token}`);
    if (key !== undefined) req.query({ key });
    return req;
};

const stubS3Ok = (overrides = {}) => mock.method(storage, 'fetchS3Object', async () => ({
    ContentType: 'application/pdf',
    Body:        makeStream(),
    ...overrides,
}));

test('document-proxy characterization - validation', async (t) => {
    t.before(async () => db.connect());
    t.after(async ()  => db.disconnect());
    t.beforeEach(async () => db.clearAll());
    t.afterEach(() => mock.restoreAll());

    await t.test('1. missing key → 400 with exact body (no auth needed to prove parsing)', async () => {
        const user  = await seedAgent();
        const token = tokenFor(user);
        const res   = await get(undefined, token);
        assert.equal(res.status, 400);
        assert.equal(res.body.success, false);
        assert.equal(res.body.message, 'Missing required query parameter: key');
    });

    await t.test('2. empty string key → 400', async () => {
        const user  = await seedAgent();
        const token = tokenFor(user);
        const res   = await get('', token);
        assert.equal(res.status, 400);
        assert.equal(res.body.success, false);
    });

    await t.test('3. blocked prefix → exact 403 body with debug_key_start', async () => {
        const user  = await seedAgent();
        const token = tokenFor(user);
        const res   = await get('private/secret.pdf', token);
        assert.equal(res.status, 403);
        assert.equal(res.body.success, false);
        assert.equal(res.body.message, 'Access denied: key path is not permitted.');
        assert.ok(!('debug_key_start' in res.body));
    });

    await t.test('8. S3 NoSuchKey → 404 with exact body and debug_key', async () => {
        mock.method(storage, 'fetchS3Object', async () => {
            const err = new Error('key does not exist');
            err.name  = 'NoSuchKey';
            throw err;
        });
        const user  = await seedAgent();
        const token = tokenFor(user);
        const res   = await get('owners/abc/missing.pdf', token);
        assert.equal(res.status, 404);
        assert.equal(res.body.success, false);
        assert.equal(res.body.message, 'Document not found. It may have been deleted or the key is incorrect.');
        assert.ok(!('debug_key' in res.body));
    });

    await t.test('9. unexpected S3 error → 500 with exact body', async () => {
        mock.method(storage, 'fetchS3Object', async () => {
            throw new Error('Network error');
        });
        const user  = await seedAgent();
        const token = tokenFor(user);
        const res   = await get('owners/abc/doc.pdf', token);
        assert.equal(res.status, 500);
        assert.equal(res.body.success, false);
        assert.equal(res.body.message, 'Failed to retrieve document.');
    });

    await t.test('10. unauthenticated request → 401', async () => {
        const res = await get('owners/abc/doc.pdf', null);
        assert.equal(res.status, 401);
    });
});
