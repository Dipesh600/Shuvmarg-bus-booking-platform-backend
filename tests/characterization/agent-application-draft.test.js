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
const generateValidToken = (p) => jwt.sign({ ...p, name: p.name || 'Test User', roles: [p.role], activeRole: p.role, purpose: 'access' }, process.env.SECRET_KEY || buildRuntimeValue('jwt-fallback'), { expiresIn: '1h' });

test('agent application draft characterization', async (t) => {
    await db.connect();
    t.after(async () => await db.disconnect());
    t.beforeEach(async () => { await User.deleteMany({}); await Agent.deleteMany({}); });

    const seedUser = async (role = 'agent') => {
        const n = Math.floor(Math.random() * 100000).toString();
        const pw = buildRuntimeValue('pw');
        return User.create({ name: `Agent Draft ${n}`, email: `agent-draft-${n}@example.test`, phone: `98777${n.padStart(5, '0')}`, password: pw, role, roles: [role], status: 'active' });
    };

    await t.test('route keeps middleware order without requireApprovedAgent', async () => {
        const routeFile = fs.readFileSync('routes/agentRoute/agentRoute.js', 'utf8');
        assert.match(routeFile, /router\.post\("\/application\/save", auth, verifyRoleFromDB, agentMiddleware, agentApplicationDraft\.saveApplicationDraft\)/);
        assert.equal(routeFile.includes('"/application/save", auth, verifyRoleFromDB, agentMiddleware, requireApprovedAgent'), false);
    });

    await t.test('should return 401 when no token is provided', async () => {
        const response = await request(app).post('/api/agent/application/save').send({});
        assert.equal(response.status, 401);
        assert.deepEqual(response.body, { status: false, message: 'Authorization header is missing or invalid' });
    });

    await t.test('should return 401 for non-agent role', async () => {
        const passenger = await seedUser('passenger');
        const response = await request(app).post('/api/agent/application/save').set('Authorization', `Bearer ${generateValidToken({ id: passenger._id, role: 'passenger' })}`).send({});
        assert.equal(response.status, 403);
        assert.equal(response.body.errorCode, 'INSUFFICIENT_ROLE');
    });

    await t.test('should create a new Agent if one does not exist and save it with supported fields', async () => {
        const user = await seedUser();
        const payload = { district: 'Kathmandu', municipality: 'KMC', placeName: 'Thamel', businessName: 'Draft Bus', whatsappConsent: true };
        const response = await request(app).post('/api/agent/application/save').set('Authorization', `Bearer ${generateValidToken({ id: user._id, role: 'agent' })}`).send(payload);

        assert.equal(response.status, 200);
        assert.equal(response.body.success, true);
        assert.equal(response.body.message, 'Application draft saved.');
        assert.equal(response.body.data.applicationStatus, 'DRAFT');
        assert.ok(response.body.data.agentId);
        const agent = await Agent.findOne({ user: user._id });
        assert.ok(agent);
        assert.equal(agent.district, 'Kathmandu');
        assert.equal(agent.businessName, 'Draft Bus');
        assert.equal(agent.whatsappConsent, true);
    });

    await t.test('should reject saving if applicationStatus is not DRAFT or MORE_INFO', async () => {
        const user = await seedUser();
        await Agent.create({ user: user._id, agentId: 'AG123456', applicationStatus: 'PENDING' });
        const response = await request(app).post('/api/agent/application/save').set('Authorization', `Bearer ${generateValidToken({ id: user._id, role: 'agent' })}`).send({ district: 'Pokhara' });

        assert.equal(response.status, 400);
        assert.deepEqual(response.body, { success: false, message: 'Application cannot be edited in "PENDING" status.' });
        const agent = await Agent.findOne({ user: user._id });
        assert.notEqual(agent.district, 'Pokhara');
    });

    await t.test('should update omitted fields only if they are not undefined, and explicit nulls', async () => {
        const user = await seedUser();
        await Agent.create({ user: user._id, agentId: 'AG123456', applicationStatus: 'DRAFT', district: 'Kathmandu', municipality: 'Old' });
        const payload = { district: 'Pokhara', municipality: null };
        const response = await request(app).post('/api/agent/application/save').set('Authorization', `Bearer ${generateValidToken({ id: user._id, role: 'agent' })}`).send(payload);

        assert.equal(response.status, 200);
        const agent = await Agent.findOne({ user: user._id });
        assert.equal(agent.district, 'Pokhara');
        assert.equal(agent.municipality, null);
    });

    await t.test('should ignore unknown fields', async () => {
        const user = await seedUser();
        const response = await request(app).post('/api/agent/application/save').set('Authorization', `Bearer ${generateValidToken({ id: user._id, role: 'agent' })}`).send({ unknownField: 'test', district: 'Ktm' });

        assert.equal(response.status, 200);
        const agent = await Agent.findOne({ user: user._id });
        assert.equal(agent.district, 'Ktm');
        assert.equal(agent.toObject().unknownField, undefined);
    });

    await t.test('should preserve whatsappConsent conversion to boolean', async () => {
        const user = await seedUser();
        const response = await request(app).post('/api/agent/application/save').set('Authorization', `Bearer ${generateValidToken({ id: user._id, role: 'agent' })}`).send({ whatsappConsent: 'true' });
        assert.equal(response.status, 200);
        const agent = await Agent.findOne({ user: user._id });
        assert.equal(agent.whatsappConsent, true);
    });
});
