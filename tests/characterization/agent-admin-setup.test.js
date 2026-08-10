'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const request = require('supertest');
const { createAdminToken } = require('../helpers/admin-token');
const jwt = require('jsonwebtoken');
const axios = require('axios');

const db = require('../helpers/db');
const app = require('../helpers/app');
const User = require('../../models/userModel');
const Agent = require('../../models/agentModel');
const notifications = require('../../controllers/notificationController/notification_manager');

let seq = 0;
const credential = () => `${crypto.randomBytes(24).toString('hex')}A1`;
const next = () => String(++seq).padStart(3, '0');

const adminToken = async () => {
  const n = next();
  return createAdminToken({
    adminId: `SUMA-ADM-${n}`,
    email: `setup-admin-${n}@example.test`,
    password: credential(),
    role: 'SUPER_ADMIN',
  });
};

const seedAgent = async (attrs = {}) => {
  const n = next();
  const user = await User.create({
    name: attrs.name || `Agent ${n}`,
    email: `agent-setup-${n}@example.test`,
    phone: attrs.phone || `98666${n.padStart(5, '0')}`,
    password: credential(),
    role: 'agent',
    roles: ['agent'],
    status: 'inactive',
  });
  const agent = await Agent.create({ user: user._id, agentId: `SHV-AG-SET-${n}`, ...attrs.agent });
  return { user, agent };
};

const setup = (token, body) =>
  request(app).patch('/api/admin/finalizeAgentSetup').set('Authorization', `Bearer ${token}`).send(body);

test('agent admin setup characterization', async (t) => {
  t.before(async () => db.connect());
  t.after(async () => db.disconnect());
  t.beforeEach(async () => db.clearAll());

  await t.test('route is admin-protected and validation responses are exact', async () => {
    assert.equal((await request(app).patch('/api/admin/finalizeAgentSetup').send({})).status, 401);
    const token = await adminToken();
    assert.deepEqual((await setup(token, {})).body, { success: false, message: 'id is required' });
    const missing = await setup(token, { id: 'SHV-AG-NONE' });
    assert.equal(missing.status, 404);
    assert.deepEqual(missing.body, { success: false, message: 'Agent not found' });
  });

  await t.test('Agent ObjectId and agentId lookups preserve DEFAULT updates and response', async () => {
    const token = await adminToken();
    const { agent } = await seedAgent();
    const byId = await setup(token, {
      id: agent._id, agentType: 'DEFAULT', district: 'Kaski', municipality: 'Pokhara',
      businessName: 'Shop', shopAddress: '', commissionRate: 0, minSettlementThreshold: 0, adminNotes: '',
    });
    assert.equal(byId.status, 200);
    assert.equal(byId.body.message, 'Agent profile updated.');
    let saved = await Agent.findById(agent._id).lean();
    assert.equal(saved.district, 'Kaski');
    assert.equal(saved.municipality, 'Pokhara');
    assert.equal(saved.businessName, 'Shop');
    assert.equal(saved.shopAddress, null);
    assert.equal(saved.commissionRate, 0);
    assert.equal(saved.minSettlementThreshold, 0);
    assert.equal(saved.adminNotes, '');
    const byAgentId = await setup(token, { id: agent.agentId, operationType: 'hotel' });
    assert.equal(byAgentId.status, 200);
    saved = await Agent.findById(agent._id).lean();
    assert.equal(saved.operationType, 'hotel');
  });

  await t.test('OPERATOR_LINKED validation, approval, user sync and notifications are exact', async () => {
    const token = await adminToken();
    const { user, agent } = await seedAgent({ name: 'Counter Agent', phone: '9800000001' });
    await Agent.findByIdAndUpdate(agent._id, { allowedRouteIds: [user._id] });
    assert.equal((await setup(token, { id: agent._id, agentType: 'OPERATOR_LINKED' })).body.message,
      'linkedOperatorId is required for OPERATOR_LINKED agents');
    assert.equal((await setup(token, { id: agent._id, agentType: 'OPERATOR_LINKED', linkedOperatorId: user._id,
      busAccessScope: 'SPECIFIC_ROUTES' })).body.message,
      'allowedRouteIds is required when busAccessScope is SPECIFIC_ROUTES');
    const sms = [];
    const locals = [];
    const originalPost = axios.post;
    const originalLocal = notifications.createLocalNotification;
    axios.post = async (_url, payload) => { sms.push(payload); return { data: { ok: true } }; };
    notifications.createLocalNotification = async (...args) => { locals.push(args); };
    try {
      const res = await setup(token, { id: agent._id, agentType: 'OPERATOR_LINKED', linkedOperatorId: user._id });
      assert.equal(res.status, 200);
      assert.equal(res.body.message, 'Operator-linked agent created and approved!');
      const saved = await Agent.findById(agent._id).lean();
      assert.equal(saved.agentType, 'OPERATOR_LINKED');
      assert.equal(saved.busAccessScope, 'ALL_OPERATOR_BUSES');
      assert.deepEqual(saved.allowedRouteIds, []);
      assert.equal(saved.applicationStatus, 'APPROVED');
      assert.ok(saved.approvedAt);
      assert.equal(String(saved.approvedBy), jwt.decode(token).id);
      assert.ok(saved.submittedAt);
      const synced = await User.findById(user._id).lean();
      assert.equal(synced.isVerified, true);
      assert.equal(synced.status, 'active');
      assert.match(decodeURIComponent(sms[0]), /Welcome to Shuvmarg, Counter Agent!/);
      assert.deepEqual(locals[0].slice(1), [
        'AGENT_KYC_UPDATE', 'Welcome to Shuvmarg!',
        'Your agent account is ready. Download the Shuvmarg Partner App to get started.',
        { applicationStatus: 'APPROVED', agentId: agent.agentId },
      ]);
    } finally {
      axios.post = originalPost;
      notifications.createLocalNotification = originalLocal;
    }
  });

  await t.test('generic failure response is exact', async () => {
    const token = await adminToken();
    const original = Agent.findById;
    Agent.findById = () => { throw new Error('find failed'); };
    try {
      const res = await setup(token, { id: '64f000000000000000000001' });
      assert.equal(res.status, 500);
      assert.deepEqual(res.body, { success: false, message: 'Internal Server Error!' });
    } finally {
      Agent.findById = original;
    }
  });
});
