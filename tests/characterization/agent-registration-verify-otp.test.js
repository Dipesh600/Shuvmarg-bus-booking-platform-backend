'use strict';

process.env.SECRET_KEY ||= 'test-only-secret-32chars-minimum!!';
process.env.VERIFICATION_TOKEN_SECRET ||= 'test-only-verification-secret!!';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const db = require('../helpers/db');
const app = require('../helpers/app');
const User = require('../../models/userModel');
const PartnerLead = require('../../models/PartnerLead');
const otpHelper = require('../../utils/otpHelper');

const patch = (obj, key, fn) => {
  const old = obj[key];
  obj[key] = fn;
  return () => { obj[key] = old; };
};
const phone = (n) => `98171${String(n).padStart(4, '0')}`;
const seed = (p, fields = {}) => User.create({
  name: 'Agent Verify',
  phone: p,
  password: bcrypt.hashSync('AgentPass123!', 10),
  role: 'passenger',
  roles: [],
  status: 'active',
  ...fields,
});

const findLeadEventually = async (query, maxAttempts = 50, delayMs = 10) => {
  for (let i = 0; i < maxAttempts; i++) {
    const lead = await PartnerLead.findOne(query);
    if (lead) return lead;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error('PartnerLead not found after polling');
};

test('Agent registration verifyOTP characterization', async (t) => {
  t.before(async () => db.connect());
  t.after(async () => db.disconnect());
  t.beforeEach(async () => db.clearAll());

  await t.test('missing inputs and invalid sanitized length preserve bodies', async () => {
    let res = await request(app).post('/api/auth/agent/verifyOTP').send({ otp: '123456' });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, {
      success: false,
      message: 'Phone number and verification code are required.',
    });
    res = await request(app).post('/api/auth/agent/verifyOTP').send({ phone: phone(1), otp: '12-34' });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { success: false, message: 'Verification code must be 6 digits.' });
  });

  await t.test('OTP helper rejection and race-role check preserve exact responses', async () => {
    let restore = patch(otpHelper, 'verifyOTPCode', async () => ({ valid: false, error: 'bad otp' }));
    try {
      const res = await request(app).post('/api/auth/agent/verifyOTP')
        .send({ phone: phone(2), otp: '123456' });
      assert.equal(res.status, 400);
      assert.deepEqual(res.body, { success: false, message: 'bad otp' });
    } finally { restore(); }
    const p = phone(3);
    await seed(p, { role: 'agent', roles: ['agent'] });
    restore = patch(otpHelper, 'verifyOTPCode', async (actualPhone, otp, purpose) => {
      assert.equal(actualPhone, p);
      assert.equal(otp, '123456');
      assert.equal(purpose, 'AGENT_REGISTRATION');
      return { valid: true };
    });
    try {
      const res = await request(app).post('/api/auth/agent/verifyOTP')
        .send({ phone: p, otp: 'abc123456' });
      assert.equal(res.status, 400);
      assert.deepEqual(res.body, {
        success: false,
        message: 'Phone verification could not be completed. Please start again.',
      });
    } finally { restore(); }
  });

  await t.test('new-user success writes lead and returns verificationToken', async () => {
    const p = phone(4);
    const restore = patch(otpHelper, 'verifyOTPCode', async () => ({ valid: true }));
    try {
      const res = await request(app).post('/api/auth/agent/verifyOTP')
        .send({ phone: p, otp: '123456' });
      assert.equal(res.status, 200);
      assert.equal(res.body.exists, false);
      assert.deepEqual(res.body.existingRoles, []);
      const decoded = jwt.verify(res.body.verificationToken, process.env.VERIFICATION_TOKEN_SECRET);
      assert.equal(decoded.phone, p);
      assert.equal(decoded.purpose, 'AGENT_REGISTRATION');
      const lead = await findLeadEventually({ phone: p, leadType: 'otp_verified', entityType: 'agent' });
      assert.equal(lead.phoneVerified, true);
      assert.equal(lead.source, 'agent_app');
    } finally { restore(); }
  });

  await t.test('existing-user success resolves fallback roles; lead failure is non-fatal', async () => {
    const p = phone(5);
    await User.collection.insertOne({
      name: 'Existing Agent Lead',
      phone: p,
      password: bcrypt.hashSync('AgentPass123!', 10),
      role: 'busOwner',
      roles: [],
      status: 'active',
    });
    const restoreOtp = patch(otpHelper, 'verifyOTPCode', async () => ({ valid: true }));
    const restoreLead = patch(PartnerLead, 'findOneAndUpdate', () => ({
      catch: (fn) => fn(new Error('lead failed')),
    }));
    try {
      const res = await request(app).post('/api/auth/agent/verifyOTP')
        .send({ phone: p, otp: '123456' });
      assert.equal(res.status, 200);
      assert.equal(res.body.exists, true);
      assert.equal(res.body.userName, 'Existing Agent Lead');
      assert.deepEqual(res.body.existingRoles, ['busOwner']);
      assert.ok(res.body.verificationToken);
    } finally {
      restoreLead();
      restoreOtp();
    }
  });
});
