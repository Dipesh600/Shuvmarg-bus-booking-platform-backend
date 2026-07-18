'use strict';

process.env.SECRET_KEY ||= 'test-only-secret-32chars-minimum!!';
process.env.VERIFICATION_TOKEN_SECRET ||= 'test-only-verification-secret!!';

const crypto = require('crypto');
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcryptjs');

const db = require('../helpers/db');
const app = require('../helpers/app');
const User = require('../../models/userModel');
const Agent = require('../../models/agentModel');
const OTP = require('../../models/otpModel');
const verificationToken = require('../../utils/verificationToken');

const hash = (otp) => crypto.createHmac('sha256', process.env.SECRET_KEY)
  .update(String(otp)).digest('hex');
const phone = (n) => `98173${String(n).padStart(4, '0')}`;
const tokenFor = (p) => verificationToken.issueVerificationToken(p, 'AGENT_REGISTRATION');
const usedOtp = (p) => OTP.create({
  phone: p, purpose: 'AGENT_REGISTRATION', otp: hash('123456'),
  otpExpiry: new Date(Date.now() + 300000), isUsed: true,
});
const user = (p, fields = {}) => User.create({
  name: 'Upgrade User',
  phone: p,
  password: bcrypt.hashSync('OldPass123!', 10),
  role: 'passenger',
  roles: ['passenger'],
  status: 'active',
  ...fields,
});
const register = (body) => request(app).post('/api/auth/agent/register').send(body);

test('Agent registration upgrade characterization', async (t) => {
  t.before(async () => db.connect());
  t.after(async () => db.disconnect());
  t.beforeEach(async () => db.clearAll());

  await t.test('fully registered agent is rejected with exact 409', async () => {
    const p = phone(1);
    await usedOtp(p);
    const u = await user(p, { role: 'agent', roles: ['agent'] });
    await Agent.create({ user: u._id, applicationStatus: 'DRAFT' });
    const res = await register({
      phone: p, name: 'Agent User', password: 'AgentPass123!', verificationToken: tokenFor(p),
    });
    assert.equal(res.status, 409);
    assert.deepEqual(res.body, {
      success: false,
      message: 'This mobile number is already registered as an agent. Please log in instead.',
      errorCode: 'ROLE_ALREADY_REGISTERED',
      hint: 'login',
    });
  });

  await t.test('existing-user path requires and validates password', async () => {
    const p = phone(2);
    await usedOtp(p);
    await user(p);
    let res = await register({ phone: p, name: 'Upgrade User', verificationToken: tokenFor(p) });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { success: false, message: 'Password is required.' });
    res = await register({ phone: p, name: 'Upgrade User', password: 'weak', verificationToken: tokenFor(p) });
    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.ok(Array.isArray(res.body.errors));
  });

  await t.test('existing-user upgrade replaces password and preserves primary role/status', async () => {
    const p = phone(3);
    await usedOtp(p);
    const u = await user(p, { status: 'inactive' });
    const res = await register({
      phone: p, name: 'Upgrade User', password: 'AgentPass123!', verificationToken: tokenFor(p),
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.message, 'Agent access added to your account. Your new password has been set.');
    assert.equal(res.body.isUpgrade, true);
    const fresh = await User.findById(u._id).select('+password');
    assert.equal(fresh.role, 'passenger');
    assert.equal(fresh.status, 'inactive');
    assert.equal(fresh.roles.includes('agent'), true);
    assert.equal(await bcrypt.compare('AgentPass123!', fresh.password), true);
    assert.equal(await bcrypt.compare('OldPass123!', fresh.password), false);
    const agent = await Agent.findOne({ user: u._id });
    assert.equal(agent.applicationStatus, 'DRAFT');
  });

  await t.test('orphaned agent role repairs by creating missing Agent profile', async () => {
    const p = phone(4);
    await usedOtp(p);
    const u = await user(p, { role: 'agent', roles: ['agent'] });
    const res = await register({
      phone: p, name: 'Repair Agent', password: 'AgentPass123!', verificationToken: tokenFor(p),
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.isUpgrade, true);
    const agent = await Agent.findOne({ user: u._id });
    assert.ok(agent);
    assert.equal(agent.applicationStatus, 'DRAFT');
  });
});
