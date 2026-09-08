'use strict';

/**
 * tests/characterization/document-proxy-streaming.test.js
 *
 * Characterization tests for:
 *   GET /api/agent/documents/view
 *
 * S3 interaction is stubbed via module-level mock of storage.fetchS3Object.
 * A real in-memory MongoDB user is seeded so the auth + verifyRoleFromDB
 * middleware chain succeeds exactly as in production.
 */

const test    = require('node:test');
const assert  = require('node:assert/strict');
const crypto  = require('node:crypto');
const { Readable } = require('node:stream');
const { mock } = require('node:test');
const request = require('supertest');
const jwt     = require('jsonwebtoken');

/* ── env must be set before any module loads ─────────────────────────────── */
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
process.env.FCM_PROJECT_ID        = '';
process.env.FCM_CLIENT_EMAIL      = '';
process.env.FCM_PRIVATE_KEY       = '';

const db      = require('../helpers/db');
const app     = require('../helpers/app');
const User    = require('../../models/userModel');
const storage = require('../../src/modules/shared/document-proxy/document-proxy.storage.js');

/* ── helpers ─────────────────────────────────────────────────────────────── */
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
    await require('../../models/agentModel').collection.insertOne({ user: user._id, documents: [{ fileKey: '/api/agent/documents/view' }, { fileKey: 'agents/xyz/doc.pdf' }, { fileKey: 'owners/123/citizenship.pdf' }, { fileKey: 'owners/123/doc.pdf' }, { fileKey: 'owners/abc/doc.jpg' }] });
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

/* ── tests ───────────────────────────────────────────────────────────────── */
test('document-proxy characterization - streaming', async (t) => {
    t.before(async () => db.connect());
    t.after(async ()  => db.disconnect());
    t.beforeEach(async () => db.clearAll());
    t.afterEach(() => mock.restoreAll());

    await t.test('4. allowed prefix owners/ streams file and sets headers', async () => {
        stubS3Ok({ ContentType: 'image/jpeg' });
        const user  = await seedAgent();
        const token = tokenFor(user);
        const res   = await get('owners/abc/doc.jpg', token);
        assert.equal(res.status, 200);
        assert.equal(res.headers['content-type'], 'image/jpeg');
        assert.equal(res.headers['cache-control'], 'private, no-store');
    });

    await t.test('5. allowed prefix agents/ is served', async () => {
        stubS3Ok({ ContentType: 'application/pdf' });
        const user  = await seedAgent();
        const token = tokenFor(user);
        const res   = await get('agents/xyz/doc.pdf', token);
        assert.equal(res.status, 200);
    });

    await t.test('6. Content-Disposition uses last key segment', async () => {
        stubS3Ok();
        const user  = await seedAgent();
        const token = tokenFor(user);
        const res   = await get('owners/123/citizenship.pdf', token);
        assert.ok(res.headers['content-disposition'].includes('citizenship.pdf'));
    });

    await t.test('7. Content-Length is forwarded when S3 provides it', async () => {
        const data = Buffer.from('file-bytes');
        mock.method(storage, 'fetchS3Object', async () => ({
            ContentType:   'application/pdf',
            ContentLength: data.length,
            Body:          Readable.from([data]),
        }));
        const user  = await seedAgent();
        const token = tokenFor(user);
        const res   = await get('owners/123/doc.pdf', token);
        assert.equal(res.headers['content-length'], String(data.length));
    });
});
