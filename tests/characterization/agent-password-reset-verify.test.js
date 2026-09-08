'use strict';

process.env.SECRET_KEY ||= 'test-only-secret-32chars-minimum!!';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcryptjs');

const db = require('../helpers/db');
const app = require('../helpers/app');
const User = require('../../models/userModel');
const enumGuard = require('../../utils/enumGuard');

const patch = (obj, key, fn) => {
  const old = obj[key];
  obj[key] = fn;
  return () => { obj[key] = old; };
};
const phone = (n) => `98181${String(n).padStart(5, '0')}`;
const user = (p, fields = {}) => User.create({
  name: 'Reset Verify',
  phone: p,
  password: bcrypt.hashSync('AgentPass123!', 10),
  role: 'agent',
  roles: ['agent'],
  status: 'active',
  ...fields,
});

test('agent password reset OTP verify characterization', async (t) => {
  t.before(async () => db.connect());
  t.after(async () => db.disconnect());
  t.beforeEach(async () => db.clearAll());

  await t.test('missing and malformed inputs preserve exact responses', async () => {
    let res = await request(app).post('/api/auth/agent/verifyOtpForReset').send({ otp: '123456' });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { success: false, message: 'Phone and OTP are required.' });
    res = await request(app).post('/api/auth/agent/verifyOtpForReset').send({ phone: phone(1) });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { success: false, message: 'Phone and OTP are required.' });
    res = await request(app).post('/api/auth/agent/verifyOtpForReset').send({ phone: phone(2), otp: '12-34' });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { success: false, message: 'Verification code must be 6 digits.' });
  });

  await t.test('otpFirstVerify receives sanitized OTP, purpose and consume=false', async () => {
    const calls = [];
    const restore = patch(enumGuard, 'otpFirstVerify', async (p, otp, purpose, consume) => {
      calls.push([p, otp, purpose, consume]);
      return { valid: true, user: { roles: ['agent'], role: 'passenger', status: 'active' } };
    });
    try {
      const res = await request(app)
        .post('/api/auth/agent/verifyOtpForReset')
        .send({ phone: phone(3), otp: 'a1-2 3x456' });
      assert.equal(res.status, 200);
      assert.deepEqual(calls, [[phone(3), '123456', 'AGENT_PASSWORD_RESET', false]]);
      assert.deepEqual(res.body, { success: true, message: 'OTP verified. Proceed to reset password.' });
    } finally { restore(); }
  });

  await t.test('invalid OTP and non-agent valid OTP preserve exact bodies', async () => {
    let mode = 'invalid';
    const restore = patch(enumGuard, 'otpFirstVerify', async () => (
      mode === 'invalid'
        ? { valid: false, user: null, error: 'helper says no' }
        : { valid: true, user: { roles: [], role: 'passenger' } }
    ));
    try {
      let res = await request(app).post('/api/auth/agent/verifyOtpForReset').send({ phone: phone(4), otp: '123456' });
      assert.equal(res.status, 400);
      assert.deepEqual(res.body, { success: false, message: 'helper says no' });
      mode = 'non-agent';
      res = await request(app).post('/api/auth/agent/verifyOtpForReset').send({ phone: phone(5), otp: '123456' });
      assert.equal(res.status, 400);
      assert.deepEqual(res.body, { success: false, message: 'Invalid or expired verification code.' });
    } finally { restore(); }
  });

  await t.test('empty role membership is rejected and unexpected failure is preserved', async () => {
    let mode = 'role';
    const restore = patch(enumGuard, 'otpFirstVerify', async () => {
      if (mode === 'boom') throw new Error('boom');
      return { valid: true, user: { roles: [], role: 'agent', status: 'invited' } };
    });
    try {
      let res = await request(app).post('/api/auth/agent/verifyOtpForReset').send({ phone: phone(6), otp: '123456' });
      assert.equal(res.status, 400);
      mode = 'boom';
      res = await request(app).post('/api/auth/agent/verifyOtpForReset').send({ phone: phone(7), otp: '123456' });
      assert.equal(res.status, 500);
      assert.deepEqual(res.body, { success: false, message: 'Internal Server Error' });
    } finally { restore(); }
  });
});
