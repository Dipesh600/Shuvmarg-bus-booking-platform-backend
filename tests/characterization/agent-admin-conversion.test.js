'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const request = require('supertest');
const { createAdminToken } = require('../helpers/admin-token');

const db = require('../helpers/transaction-db');
const app = require('../helpers/app');
const User = require('../../models/userModel');
const Agent = require('../../models/agentModel');

let seq = 0;
const credential = () => `${crypto.randomBytes(24).toString('hex')}A1`;
const next = () => String(++seq).padStart(3, '0');

const adminToken = async () => {
  const n = next();
  return createAdminToken({
    adminId: `SUMA-ADM-${n}`,
    email: `conv-admin-${n}@example.test`,
    password: credential(),
    role: 'SUPER_ADMIN',
  });
};

const seedUser = (attrs = {}) => {
  const n = next();
  return User.create({
    name: `User ${n}`,
    email: `agent-conv-${n}@example.test`,
    phone: `98555${n.padStart(5, '0')}`,
    password: credential(),
    role: attrs.role || 'passenger',
    roles: attrs.roles,
    status: 'active',
  });
};

const convert = (token, body) =>
  request(app).post('/api/admin/makeUserAgent').set('Authorization', `Bearer ${token}`).send(body);

test('agent admin conversion characterization', async (t) => {
  t.before(async () => db.connect());
  t.after(async () => db.disconnect());
  t.beforeEach(async () => db.clearAll());

  await t.test('route is admin-protected and validation responses are exact', async () => {
    assert.equal((await request(app).post('/api/admin/makeUserAgent').send({})).status, 401);
    const token = await adminToken();
    assert.deepEqual((await convert(token, {})).body, { success: false, message: 'Id is required!' });
    assert.deepEqual((await convert(token, { id: 'bad-id' })).body, {
      success: false,
      message: 'Invalid user ID format!',
    });
    const missingId = '64f000000000000000000001';
    assert.deepEqual((await convert(token, { id: missingId })).body, {
      success: false,
      message: 'User not found!',
    });
  });

  await t.test('existing agent role is rejected with exact response', async () => {
    const token = await adminToken();
    const user = await seedUser({ roles: ['agent'], role: 'passenger' });
    const res = await convert(token, { id: user._id });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { success: false, message: 'User is already an agent!' });
  });

  await t.test('explicitly empty roles stay revoked while an administrator adds only agent', async () => {
    const token = await adminToken();
    let user = await seedUser({ roles: ['passenger'], role: 'passenger' });
    await User.collection.updateOne({ _id: user._id }, { $set: { roles: [] } });
    user = await User.findById(user._id);
    const res = await convert(token, { id: user._id });
    assert.equal(res.status, 200);
    assert.equal(res.body.message, 'Agent role added to user successfully!');
    assert.deepEqual(res.body.data.roles, ['agent']);
    const updated = await User.findById(user._id).lean();
    assert.equal(updated.role, 'passenger');
    assert.ok(updated.roles.includes('agent'));
    assert.ok(updated.roleActivatedAt.agent);
    const agent = await Agent.findOne({ user: user._id });
    assert.equal(String(res.body.data.agentMongoId), String(agent._id));
    assert.equal(res.body.data.agentId, agent.agentId);
  });

  await t.test('adds agent to existing roles and reuses existing Agent document', async () => {
    const token = await adminToken();
    const user = await seedUser({ roles: ['passenger', 'busOwner'], role: 'passenger' });
    const existing = await Agent.create({ user: user._id });
    const res = await convert(token, { id: user._id });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.roles, ['passenger', 'busOwner', 'agent']);
    assert.equal(String(res.body.data.agentMongoId), String(existing._id));
    assert.equal(await Agent.countDocuments({ user: user._id }), 1);
  });

  await t.test('unexpected error preserves exact generic 500 response', async () => {
    const token = await adminToken();
    const original = User.findById;
    User.findById = (id, ...args) => {
      if (String(id) === '64f000000000000000000001') {
        throw new Error('find failed');
      }
      return original.call(User, id, ...args);
    };
    try {
      const res = await convert(token, { id: '64f000000000000000000001' });
      assert.equal(res.status, 500);
      assert.deepEqual(res.body, { success: false, message: 'Internal Server Error!' });
    } finally {
      User.findById = original;
    }
  });
});
