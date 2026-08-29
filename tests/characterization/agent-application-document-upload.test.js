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
const fs = require('node:fs');

const buildRuntimeValue = (prefix) => `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
const generateValidToken = (p) => jwt.sign(
    { ...p, name: p.name || 'Test User', roles: [p.role], activeRole: p.role, purpose: 'access' },
    process.env.SECRET_KEY || buildRuntimeValue('jwt-fallback'),
    { expiresIn: '1h' },
);

test('agent application document upload: route, auth, status gate', async (t) => {
    await db.connect();
    t.after(async () => db.disconnect());
    t.beforeEach(async () => { await User.deleteMany({}); await Agent.deleteMany({}); });

    const seedUser = async (role = 'agent') => {
        const n = Math.floor(Math.random() * 100000).toString();
        const pw = buildRuntimeValue('pw');
        return User.create({
            name: `Doc Upload ${n}`,
            email: `doc-upload-${n}@example.test`,
            phone: `98766${n.padStart(5, '0')}`,
            password: pw,
            role,
            roles: [role],
            status: 'active',
        });
    };

    await t.test('route keeps middleware order without requireVerifiedAgent', async () => {
        const routeFile = fs.readFileSync('routes/agentRoute/agentRoute.js', 'utf8');
        assert.match(
            routeFile,
            /router\.post\("\/application\/document", auth, verifyRoleFromDB, agentMiddleware, agentApplicationDocumentUpload\.uploadDocument\)/,
        );
        assert.equal(
            routeFile.includes('"/application/document", auth, verifyRoleFromDB, agentMiddleware, requireVerifiedAgent'),
            false,
        );
    });

    await t.test('returns 401 when no token is provided', async () => {
        const res = await request(app).post('/api/agent/application/document').send({});
        assert.equal(res.status, 401);
    });

    await t.test('returns 403 for non-agent role', async () => {
        const user = await seedUser('passenger');
        const res = await request(app)
            .post('/api/agent/application/document')
            .set('Authorization', `Bearer ${generateValidToken({ id: user._id, role: 'passenger' })}`)
            .send({});
        assert.equal(res.status, 403);
        assert.equal(res.body.errorCode, 'INSUFFICIENT_ROLE');
    });

    await t.test('returns 401 when userId is missing from token payload', async () => {
        const token = jwt.sign(
            { name: 'Nobody', roles: ['agent'], activeRole: 'agent', purpose: 'access' },
            process.env.SECRET_KEY || buildRuntimeValue('jwt-fallback'),
            { expiresIn: '1h' },
        );
        const res = await request(app)
            .post('/api/agent/application/document')
            .set('Authorization', `Bearer ${token}`)
            .send({});
        assert.equal(res.status, 401);
        assert.equal(res.body.success, false);
        assert.ok(res.body.message);
    });

    await t.test('returns 404 when no agent record exists', async () => {
        const user = await seedUser();
        const res = await request(app)
            .post('/api/agent/application/document')
            .set('Authorization', `Bearer ${generateValidToken({ id: user._id, role: 'agent' })}`)
            .send({ documentType: 'pan_card' });
        assert.equal(res.status, 404);
        assert.deepEqual(res.body, {
            success: false,
            message: 'Start your application first before uploading documents.',
        });
    });

    for (const status of ['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED']) {
        await t.test(`returns 400 for status ${status}`, async () => {
            const user = await seedUser();
            await Agent.create({ user: user._id, applicationStatus: status });
            const res = await request(app)
                .post('/api/agent/application/document')
                .set('Authorization', `Bearer ${generateValidToken({ id: user._id, role: 'agent' })}`)
                .send({ documentType: 'pan_card' });
            assert.equal(res.status, 400);
            assert.deepEqual(res.body, {
                success: false,
                message: `Cannot upload documents in "${status}" status.`,
            });
        });
    }
});
