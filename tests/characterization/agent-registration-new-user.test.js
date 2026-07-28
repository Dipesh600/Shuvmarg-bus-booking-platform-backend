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
const OTP = require('../../models/otpModel');
const Agent = require('../../models/agentModel');
const PartnerLead = require('../../models/PartnerLead');
const tokenService = require('../../utils/tokenService');
const verificationToken = require('../../utils/verificationToken');

const hash = (otp) => crypto.createHmac('sha256', process.env.SECRET_KEY)
  .update(String(otp)).digest('hex');
const phone = (n) => `98172${String(n).padStart(4, '0')}`;
const tokenFor = (p) => verificationToken.issueVerificationToken(p, 'AGENT_REGISTRATION');
const usedOtp = async (p, date = new Date()) => {
  const otp = await OTP.create({
    phone: p,
    purpose: 'AGENT_REGISTRATION',
    otp: hash('123456'),
    otpExpiry: new Date(Date.now() + 300000),
    isUsed: true,
  });
  await OTP.updateOne({ _id: otp._id }, { $set: { updatedAt: date } }, { timestamps: false });
};
const register = (body) => request(app).post('/api/auth/agent/register')
  .set('User-Agent', 'AgentReg/1')
  .send(body);

test('Agent registration new-user characterization', async (t) => {
  t.before(async () => db.connect());
  t.after(async () => db.disconnect());
  t.beforeEach(async () => db.clearAll());

  await t.test('missing phone/name, short name, invalid token, missing/expired OTP', async () => {
    let res = await register({ name: 'Valid', password: 'AgentPass123!' });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { success: false, message: 'Phone is required.' });
    res = await register({ phone: phone(1), password: 'AgentPass123!' });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { success: false, message: 'Name is required.' });
    res = await register({ phone: phone(2), name: '  ab  ', password: 'AgentPass123!' });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { success: false, message: 'Name must be at least 3 characters.' });
    res = await register({ phone: phone(3), name: 'Valid', password: 'AgentPass123!' });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /Verification token is required/);
    const p4 = phone(4);
    res = await register({ phone: p4, name: 'Valid', password: 'AgentPass123!', verificationToken: tokenFor(p4) });
    assert.equal(res.status, 400);
    assert.equal(res.body.message, 'Phone not verified. Please complete OTP verification first.');
    const p5 = phone(5);
    await usedOtp(p5, new Date(Date.now() - 31 * 60 * 1000));
    res = await register({ phone: p5, name: 'Valid', password: 'AgentPass123!', verificationToken: tokenFor(p5) });
    assert.equal(res.status, 400);
    assert.equal(res.body.message, 'OTP verification has expired. Please verify your phone again.');
  });

  await t.test('new-user password and duplicate-email validation preserve exact bodies', async () => {
    await User.create({
      name: 'Email Owner',
      phone: phone(6),
      email: 'used@example.com',
      password: bcrypt.hashSync('AgentPass123!', 10),
      roles: ['passenger'],
    });
    const p = phone(7);
    await usedOtp(p);
    let res = await register({ phone: p, name: 'Valid User', verificationToken: tokenFor(p) });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { success: false, message: 'Password is required for new registration.' });
    res = await register({ phone: p, name: 'Valid User', password: 'weak', verificationToken: tokenFor(p) });
    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.ok(Array.isArray(res.body.errors));
    res = await register({
      phone: p, name: 'Valid User', password: 'AgentPass123!',
      email: ' USED@example.com ', verificationToken: tokenFor(p),
    });
    assert.equal(res.status, 409);
    assert.deepEqual(res.body, { success: false, message: 'This email address is already registered.' });
  });

  await t.test('new-user success creates User, DRAFT Agent, lead conversion, token and cookie', async () => {
    const p = phone(8);
    await usedOtp(p);
    await PartnerLead.create({ phone: p, leadType: 'otp_verified', entityType: 'agent' });
    const res = await register({
      phone: p, name: '  New Agent  ', password: 'AgentPass123!',
      email: ' NEW@example.com ', verificationToken: tokenFor(p),
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.message, 'Account created successfully. Complete your setup to start using Shuv Marg.');
    assert.equal(res.body.activeRole, 'agent');
    assert.equal(res.body.isUpgrade, false);
    assert.equal(res.body.applicationStatus, 'DRAFT');
    assert.ok(res.body.accessToken);
    assert.equal(res.body.refreshToken, undefined);
    assert.equal(res.body.user.password, undefined);
    assert.match((res.headers['set-cookie'] || []).join('\n'), /refreshToken=.*HttpOnly.*SameSite=Lax/i);
    const user = await User.findOne({ phone: p }).select('+password');
    assert.equal(user.name, 'New Agent');
    assert.equal(user.email, 'new@example.com');
    assert.deepEqual(user.roles, ['agent']);
    assert.equal(await bcrypt.compare('AgentPass123!', user.password), true);
    const agent = await Agent.findOne({ user: user._id });
    assert.equal(agent.applicationStatus, 'DRAFT');
    assert.ok(agent.agentId);
    const lead = await PartnerLead.findOne({ phone: p, leadType: 'otp_verified', entityType: 'agent' });
    assert.equal(lead.status, 'converted');
    assert.equal(lead.fullName, 'New Agent');
    const cookieToken = res.headers['set-cookie'][0].split(';')[0].split('=')[1];
    assert.ok(tokenService.hashToken(cookieToken));
  });
});
