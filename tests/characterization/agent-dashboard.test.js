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
  role,
  roles: [role],
  activeRole: role,
  purpose: 'access',
  tokenVersion: user.tokenVersion || 0,
}, process.env.SECRET_KEY);

const seedUser = async (role = 'agent') => {
  const n = next();
  return User.create({
    name: `Agent Dash ${n}`,
    email: `agent-dash-self-${n}@example.test`,
    phone: `98123${n.padStart(5, '0')}`,
    password: credential(),
    role,
    roles: [role],
    status: 'active',
  });
};

const getDashboard = (token) =>
  request(app).get('/api/agent/dashboard').set('Authorization', `Bearer ${token}`);

test('agent self-service dashboard characterization', async (t) => {
  t.before(async () => db.connect());
  t.after(async () => db.disconnect());
  t.beforeEach(async () => db.clearAll());

  await t.test('route keeps the complete middleware order', () => {
    const routeFile = fs.readFileSync('routes/agentRoute/agentRoute.js', 'utf8');
    assert.match(routeFile, /router\.get\("\/dashboard", auth, verifyRoleFromDB, agentMiddleware, requireApprovedAgent, agentDashboard\.getDashboard\)/);
  });

  await t.test('authentication, role and approval middleware protect the route', async () => {
    assert.equal((await request(app).get('/api/agent/dashboard')).status, 401);
    const passenger = await seedUser('passenger');
    const roleRes = await getDashboard(tokenFor(passenger, 'passenger'));
    assert.equal(roleRes.status, 403);
    assert.equal(roleRes.body.errorCode, 'INSUFFICIENT_ROLE');
    const agentUser = await seedUser();
    await Agent.create({ user: agentUser._id, applicationStatus: 'PENDING' });
    const pending = await getDashboard(tokenFor(agentUser));
    assert.equal(pending.status, 403);
    assert.equal(pending.body.errorCode, 'APPLICATION_NOT_APPROVED');
  });

  await t.test('approved agent receives exact dashboard fields without mutation', async () => {
    const user = await seedUser();
    const lastBookingAt = new Date('2026-01-02T03:04:05.000Z');
    const agent = await Agent.create({
      user: user._id,
      applicationStatus: 'APPROVED',
      commissionBalance: 123.45,
      totalOnlineBookings: 7,
      totalCashBookings: 3,
      totalCommissionEarned: 456.78,
      totalCommissionSettled: 111.11,
      lastBookingAt,
      commissionRate: 8,
      agentType: 'OPERATOR_LINKED',
    });
    const before = await Agent.findById(agent._id).lean();
    const res = await getDashboard(tokenFor(user));
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, {
      success: true,
      data: {
        commissionBalance: 123.45,
        totalOnlineBookings: 7,
        totalCashBookings: 3,
        totalCommissionEarned: 456.78,
        totalCommissionSettled: 111.11,
        lastBookingAt: lastBookingAt.toISOString(),
        commissionRate: 8,
        agentType: 'OPERATOR_LINKED',
      },
    });
    const after = await Agent.findById(agent._id).lean();
    assert.deepEqual(after, before);
  });
});
