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
const OperatorBrand = require('../../models/operatorBrandModel');

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
    name: `Agent Profile ${n}`,
    email: `agent-profile-${n}@example.test`,
    phone: `98444${n.padStart(5, '0')}`,
    password: credential(),
    role,
    roles: [role],
    status: 'active',
  });
};

const getProfile = (token) =>
  request(app).get('/api/agent/profile').set('Authorization', `Bearer ${token}`);

test('agent profile characterization', async (t) => {
  t.before(async () => db.connect());
  t.after(async () => db.disconnect());
  t.beforeEach(async () => db.clearAll());

  await t.test('route keeps middleware order and access protection', async () => {
    const routeFile = fs.readFileSync('routes/agentRoute/agentRoute.js', 'utf8');
    assert.match(routeFile, /router\.get\("\/profile", auth, verifyRoleFromDB, agentMiddleware, requireVerifiedAgent, agentProfile\.getProfile\)/);
    assert.equal((await request(app).get('/api/agent/profile')).status, 401);
    const passenger = await seedUser('passenger');
    assert.equal((await getProfile(tokenFor(passenger, 'passenger'))).status, 403);
    const agentUser = await seedUser();
    await Agent.create({ user: agentUser._id, applicationStatus: 'PENDING' });
    const pending = await getProfile(tokenFor(agentUser));
    assert.equal(pending.status, 403);
    assert.equal(pending.body.errorCode, 'APPLICATION_NOT_APPROVED');
  });

  await t.test('approved agent with linked operator returns exact profile data', async () => {
    const owner = await seedUser('busOwner');
    const brand = await OperatorBrand.create({
      ownerId: owner._id,
      brandName: 'Linked Brand',
      brandCode: `OB-${next()}`,
      logo: 'https://example.test/logo.png',
    });
    const user = await seedUser();
    const approvedAt = new Date('2026-04-05T06:07:08.000Z');
    const createdAt = new Date('2026-04-01T00:00:00.000Z');
    await Agent.create({
      user: user._id,
      agentId: `SHV-AG-PRO-${next()}`,
      applicationStatus: 'APPROVED',
      linkedOperatorId: brand._id,
      businessName: 'Counter',
      shopAddress: 'Main Road',
      operationType: 'travel_agent',
      district: 'Kaski',
      municipality: 'Pokhara',
      commissionRate: 9,
      commissionBalance: 12,
      minSettlementThreshold: 300,
      totalOnlineBookings: 4,
      totalCashBookings: 5,
      totalCommissionEarned: 60,
      totalCommissionSettled: 20,
      lastBookingAt: approvedAt,
      settlementMethod: 'ESEWA',
      referralCode: 'REF123',
      qrCodeUrl: 'qr-key',
      approvedAt,
      createdAt,
      agentType: 'OPERATOR_LINKED',
    });
    const res = await getProfile(tokenFor(user));
    assert.equal(res.status, 200);
    assert.equal(res.body.message, 'Agent profile retrieved.');
    assert.equal(res.body.data.linkedOperator.brandName, 'Linked Brand');
    assert.equal(res.body.data.linkedOperator.logo, 'https://example.test/logo.png');
    assert.equal(res.body.data.linkedOperator.brandCode, brand.brandCode);
    assert.equal(res.body.data.businessName, 'Counter');
    assert.equal(res.body.data.lastBookingAt, approvedAt.toISOString());
    assert.equal(res.body.data.agentType, 'OPERATOR_LINKED');
    assert.equal(Object.hasOwn(res.body.data, 'applicationStatus'), true);
  });

  await t.test('approved agent without linked operator returns null linkedOperator', async () => {
    const user = await seedUser();
    await Agent.create({ user: user._id, applicationStatus: 'APPROVED' });
    const res = await getProfile(tokenFor(user));
    assert.equal(res.status, 200);
    assert.equal(res.body.data.linkedOperator, null);
  });
});
