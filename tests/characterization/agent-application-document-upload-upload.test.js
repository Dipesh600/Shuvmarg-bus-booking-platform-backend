'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const crypto = require('node:crypto');

const db = require('../helpers/db');
const app = require('../helpers/app');
const User = require('../../models/userModel');
const Agent = require('../../models/agentModel');

const storage = require('../../src/modules/agent/application-document-upload/document-storage.service');

const buildRuntimeValue = (prefix) => `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
const generateValidToken = (p) => jwt.sign(
    { ...p, name: p.name || 'Test User', roles: [p.role], activeRole: p.role, purpose: 'access' },
    process.env.SECRET_KEY || buildRuntimeValue('jwt-fallback'),
    { expiresIn: '1h' },
);

test('agent application document upload: validation and upload behavior', async (t) => {
    await db.connect();
    t.after(async () => db.disconnect());
    t.beforeEach(async () => { await User.deleteMany({}); await Agent.deleteMany({}); });

    const seedUser = async (role = 'agent') => {
        const n = Math.floor(Math.random() * 100000).toString();
        const pw = buildRuntimeValue('pw');
        return User.create({
            name: `Doc Upload B ${n}`,
            email: `doc-upload-b-${n}@example.test`,
            phone: `98765${n.padStart(5, '0')}`,
            password: pw,
            role,
            roles: [role],
            status: 'active',
        });
    };

    await t.test('returns 400 for invalid documentType', async () => {
        const user = await seedUser();
        await Agent.create({ user: user._id, applicationStatus: 'DRAFT' });
        const res = await request(app)
            .post('/api/agent/application/document')
            .set('Authorization', `Bearer ${generateValidToken({ id: user._id, role: 'agent' })}`)
            .send({ documentType: 'invalid_type' });
        assert.equal(res.status, 400);
        assert.match(res.body.message, /Invalid document type/);
    });

    await t.test('returns 400 for missing documentType', async () => {
        const user = await seedUser();
        await Agent.create({ user: user._id, applicationStatus: 'DRAFT' });
        const res = await request(app)
            .post('/api/agent/application/document')
            .set('Authorization', `Bearer ${generateValidToken({ id: user._id, role: 'agent' })}`)
            .send({});
        assert.equal(res.status, 400);
        assert.match(res.body.message, /Invalid document type/);
    });

    await t.test('returns 400 for missing file', async () => {
        const user = await seedUser();
        await Agent.create({ user: user._id, applicationStatus: 'DRAFT' });
        const res = await request(app)
            .post('/api/agent/application/document')
            .set('Authorization', `Bearer ${generateValidToken({ id: user._id, role: 'agent' })}`)
            .field('documentType', 'pan_card');
        assert.equal(res.status, 400);
        assert.deepEqual(res.body, {
            success: false,
            message: "No file provided. Send file in 'file' field.",
        });
    });

    await t.test('DRAFT status: valid upload returns 200 (with mocked storage)', async () => {
        const origProcess = storage.processAndUpload;
        const origPreview = storage.getPreviewUrl;
        storage.processAndUpload = async () => ({
            processed: { wasCompressed: false, originalSize: 1000, size: 1000 },
            fileKey: 'agents/test/kyc/pan-card/fake-key',
        });
        storage.getPreviewUrl = async () => 'https://s3.example.com/preview';
        try {
            const user = await seedUser();
            await Agent.create({ user: user._id, applicationStatus: 'DRAFT' });
            const res = await request(app)
                .post('/api/agent/application/document')
                .set('Authorization', `Bearer ${generateValidToken({ id: user._id, role: 'agent' })}`)
                .attach('file', Buffer.from('fake-image-data'), { filename: 'test.jpg', contentType: 'image/jpeg' })
                .field('documentType', 'pan_card');
            assert.equal(res.status, 200);
            assert.equal(res.body.success, true);
            assert.equal(res.body.message, 'pan_card uploaded successfully.');
            assert.equal(res.body.data.documentType, 'pan_card');
            assert.equal(res.body.data.previewUrl, 'https://s3.example.com/preview');
        } finally {
            storage.processAndUpload = origProcess;
            storage.getPreviewUrl = origPreview;
        }
    });

    await t.test('MORE_INFO status: valid upload returns 200 (with mocked storage)', async () => {
        const origProcess = storage.processAndUpload;
        const origPreview = storage.getPreviewUrl;
        storage.processAndUpload = async () => ({
            processed: { wasCompressed: true, originalSize: 2000, size: 800 },
            fileKey: 'agents/test/kyc/citizenship-front/fake-key',
        });
        storage.getPreviewUrl = async () => 'https://s3.example.com/preview2';
        try {
            const user = await seedUser();
            await Agent.create({ user: user._id, applicationStatus: 'MORE_INFO' });
            const res = await request(app)
                .post('/api/agent/application/document')
                .set('Authorization', `Bearer ${generateValidToken({ id: user._id, role: 'agent' })}`)
                .attach('file', Buffer.from('fake-image-data'), { filename: 'test.jpg', contentType: 'image/jpeg' })
                .field('documentType', 'citizenship_front');
            assert.equal(res.status, 200);
            assert.equal(res.body.success, true);
        } finally {
            storage.processAndUpload = origProcess;
            storage.getPreviewUrl = origPreview;
        }
    });
});
