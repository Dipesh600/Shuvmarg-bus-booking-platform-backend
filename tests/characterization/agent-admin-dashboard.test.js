'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const request = require('supertest');
const { createAdminToken } = require('../helpers/admin-token');

const db = require('../helpers/db');
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
    email: `dash-admin-${n}@example.test`,
    password: credential(),
    role: 'SUPER_ADMIN',
  });
};

const seedAgent = async (applicationStatus, agentType = 'DEFAULT') => {
  const n = next();
  const user = await User.create({
    name: `Agent ${n}`,
    email: `agent-dash-${n}@example.test`,
    phone: `98234${n.padStart(5, '0')}`,
    password: credential(),
    role: 'agent',
    roles: ['agent'],
    status: 'active',
  });
  return Agent.create({
    user: user._id,
    agentId: `SHV-AG-D${n}`,
    applicationStatus,
    agentType,
  });
};

const getDashboard = (token) =>
  request(app).get('/api/admin/agentDashboard').set('Authorization', `Bearer ${token}`);

test('agent admin dashboard characterization', async (t) => {
  t.before(async () => db.connect());
  t.after(async () => db.disconnect());
  t.beforeEach(async () => db.clearAll());

  await t.test('route is admin-protected and zero-agent response is exact', async () => {
    const missingAuth = await request(app).get('/api/admin/agentDashboard');
    assert.equal(missingAuth.status, 401);
    assert.deepEqual(missingAuth.body, {
      status: false,
      message: 'Authorization header is missing or invalid',
    });
    const res = await getDashboard(await adminToken());
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, {
      success: true,
      data: {
        totalAgents: 0,
        allTimeTotal: 0,
        approvedAgents: '0 (0% of registered)',
        pendingAgents: 0,
        rejectedAgents: 0,
        moreInfoAgents: 0,
        suspendedAgents: 0,
        draftAgents: 0,
        byType: { default: 0, operatorLinked: 0 },
      },
    });
  });

  await t.test('all status, registered, type and approved percentage counts are exact', async () => {
    await seedAgent('DRAFT');
    await seedAgent('PENDING');
    await seedAgent('APPROVED');
    await seedAgent('APPROVED', 'OPERATOR_LINKED');
    await seedAgent('REJECTED', 'OPERATOR_LINKED');
    await seedAgent('MORE_INFO');
    await seedAgent('SUSPENDED', 'OPERATOR_LINKED');
    const res = await getDashboard(await adminToken());
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, {
      success: true,
      data: {
        totalAgents: 5,
        allTimeTotal: 7,
        approvedAgents: '2 (40% of registered)',
        pendingAgents: 1,
        rejectedAgents: 1,
        moreInfoAgents: 1,
        suspendedAgents: 1,
        draftAgents: 1,
        byType: { default: 4, operatorLinked: 3 },
      },
    });
  });

  await t.test('unexpected count failure preserves exact 500 response', async () => {
    const original = Agent.countDocuments;
    Agent.countDocuments = () => { throw new Error('count failed'); };
    try {
      const res = await getDashboard(await adminToken());
      assert.equal(res.status, 500);
      assert.deepEqual(res.body, {
        success: false,
        message: 'Failed to fetch agent dashboard stats',
        error: 'count failed',
      });
    } finally {
      Agent.countDocuments = original;
    }
  });
});
