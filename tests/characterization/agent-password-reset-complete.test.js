'use strict';

process.env.SECRET_KEY ||= 'test-only-secret-32chars-minimum!!';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcryptjs');

const db = require('../helpers/db');
const app = require('../helpers/app');
const User = require('../../models/userModel');
const otpHelper = require('../../utils/otpHelper');
const tokenService = require('../../utils/tokenService');
const passwordValidator = require('../../utils/passwordValidator');

const patch = (obj, key, fn) => {
  const old = obj[key];
  obj[key] = fn;
  return () => { obj[key] = old; };
};
const phone = (n) => `98182${String(n).padStart(5, '0')}`;
const user = (p, fields = {}) => User.create({
  name: 'Reset Complete',
  phone: p,
  password: bcrypt.hashSync('OldPass123!', 10),
  role: 'agent',
  roles: ['agent'],
  status: 'active',
  isVerified: false,
  failedLoginAttempts: 3,
  lockedUntil: new Date(Date.now() + 1000),
  forcePasswordChange: true,
  ...fields,
});

test('agent password reset completion characterization', async (t) => {
  t.before(async () => db.connect());
  t.after(async () => db.disconnect());
  t.beforeEach(async () => db.clearAll());

  await t.test('required inputs, OTP length, missing user and non-agent preserve responses', async () => {
    let res = await request(app).post('/api/auth/agent/resetPassword').send({ phone: phone(1), otp: '123456' });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { success: false, message: 'Phone, OTP, and new password are required.' });
    res = await request(app).post('/api/auth/agent/resetPassword').send({ phone: phone(2), otp: '12x', newPassword: 'NewPass123!' });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { success: false, message: 'Verification code must be 6 digits.' });
    res = await request(app).post('/api/auth/agent/resetPassword').send({ phone: phone(3), otp: '123456', newPassword: 'NewPass123!' });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { success: false, message: 'Invalid OTP or phone number.' });
    await user(phone(4), { role: 'passenger', roles: ['passenger'] });
    res = await request(app).post('/api/auth/agent/resetPassword').send({ phone: phone(4), otp: '123456', newPassword: 'NewPass123!' });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { success: false, message: 'Invalid OTP or phone number.' });
  });

  await t.test('OTP consume, password validation, save, revoke and tokenVersion order are preserved', async () => {
    const p = phone(5);
    const u = await user(p);
    const order = [];
    const restores = [
      patch(otpHelper, 'verifyOTPCode', async (otpPhone, otp, purpose, consume) => {
        order.push(`otp:${otpPhone}:${otp}:${purpose}:${consume}`);
        return { valid: true };
      }),
      patch(tokenService, 'revokeAllUserTokens', async (id) => order.push(`revoke:${id}`)),
    ];
    try {
      const res = await request(app)
        .post('/api/auth/agent/resetPassword')
        .send({ phone: p, otp: 'a123456', newPassword: 'NewPass123!' });
      assert.equal(res.status, 200);
      assert.deepEqual(res.body, { success: true, message: 'Password reset successful. You can now sign in.' });
      const fresh = await User.findById(u._id).select('+password');
      assert.equal(await bcrypt.compare('NewPass123!', fresh.password), true);
      assert.equal(fresh.isVerified, true);
      assert.equal(fresh.failedLoginAttempts, 0);
      assert.equal(fresh.lockedUntil, null);
      assert.equal(fresh.forcePasswordChange, false);
      assert.equal(fresh.tokenVersion, 1);
      assert.deepEqual(order, [`otp:${p}:123456:AGENT_PASSWORD_RESET:true`, `revoke:${u._id}`]);
    } finally { restores.reverse().forEach((fn) => fn()); }
  });

  await t.test('weak password fails after OTP consumption and before persistence', async () => {
    const p = phone(6);
    await user(p);
    const weakPassword = 'weak';
    const expected = passwordValidator.validatePassword(weakPassword);
    const order = [];
    const restores = [
      patch(otpHelper, 'verifyOTPCode', async (otpPhone, otp, purpose, consume) => {
        assert.equal(otpPhone, p);
        assert.equal(otp, '123456');
        assert.equal(purpose, 'AGENT_PASSWORD_RESET');
        assert.equal(consume, true);
        order.push('otp');
        return { valid: true };
      }),
      patch(bcrypt, 'genSalt', async () => order.push('salt')),
      patch(bcrypt, 'hash', async () => order.push('hash')),
      patch(User.prototype, 'save', async () => order.push('save')),
      patch(tokenService, 'revokeAllUserTokens', async () => order.push('revoke')),
      patch(User, 'findByIdAndUpdate', async () => order.push('increment')),
    ];
    try {
      const res = await request(app)
        .post('/api/auth/agent/resetPassword')
        .send({ phone: p, otp: '123456', newPassword: weakPassword });
      assert.equal(res.status, 400);
      assert.deepEqual(res.body, {
        success: false,
        message: expected.errors?.[0] || expected.message,
      });
      assert.deepEqual(order, ['otp']);
    } finally { restores.reverse().forEach((fn) => fn()); }
  });

  await t.test('invalid OTP and unexpected OTP-helper failure map exactly', async () => {
    await user(phone(6));
    let restore = patch(otpHelper, 'verifyOTPCode', async () => ({ valid: false, error: 'bad otp' }));
    try {
      let res = await request(app).post('/api/auth/agent/resetPassword').send({ phone: phone(6), otp: '123456', newPassword: 'NewPass123!' });
      assert.equal(res.status, 400);
      assert.deepEqual(res.body, { success: false, message: 'bad otp' });
    } finally { restore(); }
    restore = patch(otpHelper, 'verifyOTPCode', async () => { throw new Error('boom'); });
    try {
      const res = await request(app).post('/api/auth/agent/resetPassword').send({ phone: phone(6), otp: '123456', newPassword: 'NewPass123!' });
      assert.equal(res.status, 500);
      assert.deepEqual(res.body, { success: false, message: 'Internal Server Error' });
    } finally { restore(); }
  });
});
