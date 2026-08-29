'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const request = require('supertest');
const jwt = require('jsonwebtoken');

const db = require('../helpers/db');
const app = require('../helpers/app');
const User = require('../../models/userModel');
const Agent = require('../../models/agentModel');

let seq = 0;
const credential = () => `${crypto.randomBytes(24).toString('hex')}A1`;
const next = () => String(++seq).padStart(3, '0');

const tokenFor = (user, role = 'agent') => jwt.sign({
  id: user._id,
  name: user.name,
  role,
  roles: [role],
  activeRole: role,
  purpose: 'access',
  tokenVersion: user.tokenVersion || 0,
}, process.env.SECRET_KEY);

const seedUser = async (role = 'agent') => {
  const n = next();
  return User.create({
    name: `Agent Status ${n}`,
    email: `agent-status-${n}@example.test`,
    phone: `98777${n.padStart(5, '0')}`,
    password: credential(),
    role,
    roles: [role],
    status: 'active',
  });
};

const getStatus = (token) =>
  request(app).get('/api/agent/application/status').set('Authorization', `Bearer ${token}`);

test('agent application status characterization', async (t) => {
  t.before(async () => db.connect());
  t.after(async () => db.disconnect());
  t.beforeEach(async () => db.clearAll());

  await t.test('route keeps middleware order without requireVerifiedAgent', async () => {
    const routeFile = fs.readFileSync('routes/agentRoute/agentRoute.js', 'utf8');
    assert.match(routeFile, /router\.get\("\/application\/status", auth, verifyRoleFromDB, agentMiddleware, agentApplicationStatus\.getApplicationStatus\)/);
    assert.equal((await request(app).get('/api/agent/application/status')).status, 401);
    const passenger = await seedUser('passenger');
    const wrongRole = await getStatus(tokenFor(passenger, 'passenger'));
    assert.equal(wrongRole.status, 403);
    assert.equal(wrongRole.body.errorCode, 'INSUFFICIENT_ROLE');
    assert.equal(routeFile.includes('"/application/status", auth, verifyRoleFromDB, agentMiddleware, requireVerifiedAgent'), false);
  });

  await t.test('no application response is exact and uses request user name', async () => {
    const user = await seedUser();
    const res = await getStatus(tokenFor(user));
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, {
      success: true,
      message: 'No application started yet.',
      data: { applicationStatus: 'DRAFT', hasApplication: false, userName: user.name },
    });
  });

  await t.test('every application status reaches route and existing response is nested', async () => {
    const statuses = ['DRAFT', 'PENDING', 'MORE_INFO', 'REJECTED', 'APPROVED'];
    for (const status of statuses) {
      const user = await seedUser();
      await Agent.create({
        user: user._id,
        applicationStatus: status,
        agentType: 'DEFAULT',
        businessName: `Business ${status}`,
        documents: [{ type: 'citizenship_front', fileKey: `https://example.test/${status}.jpg` }],
        termsAcceptedAt: new Date('2026-01-01T00:00:00.000Z'),
        whatsappConsent: true,
      });
      const res = await getStatus(tokenFor(user));
      assert.equal(res.status, 200);
      assert.equal(res.body.message, 'Application status retrieved.');
      assert.equal(res.body.data.hasApplication, true);
      assert.equal(res.body.data.applicationStatus, status);
      assert.equal(res.body.data.userName, user.name);
      assert.equal(res.body.data.business.businessName, `Business ${status}`);
      assert.equal(res.body.data.documents[0].fileKey, `https://example.test/${status}.jpg`);
      assert.equal(res.body.data.consents.whatsappConsent, true);
      assert.equal(Object.hasOwn(res.body.data, 'canReapply'), true);
    }
  });

  await t.test('endpoint does not mutate the Agent document', async () => {
    const user = await seedUser();
    const agent = await Agent.create({
      user: user._id,
      applicationStatus: 'APPROVED',
      district: 'Kaski',
    });
    const before = await Agent.findById(agent._id).lean();
    const res = await getStatus(tokenFor(user));
    assert.equal(res.status, 200);
    const after = await Agent.findById(agent._id).lean();
    assert.deepEqual(after, before);
  });
});
