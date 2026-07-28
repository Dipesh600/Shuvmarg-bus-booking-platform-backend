'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const request = require('supertest');
const bcrypt = require('bcryptjs');

const db = require('../helpers/db');
const app = require('../helpers/app');
const User = require('../../models/userModel');
const otpHelper = require('../../utils/otpHelper');
const tokenService = require('../../utils/tokenService');
const validator = require('../../utils/passwordValidator');

const patch = (obj, key, fn) => {
  const old = obj[key];
  obj[key] = fn;
  return () => { obj[key] = old; };
};
const phone = (n) => `98210${String(n).padStart(5, '0')}`;
const credential = () => `${crypto.randomBytes(24).toString('hex')}A1`;
const user = (p, fields = {}) => User.create({
  name: 'Bus Complete',
  phone: p,
  password: bcrypt.hashSync(credential(), 10),
  role: 'busOwner',
  roles: ['busOwner'],
  status: 'active',
  isVerified: false,
  failedLoginAttempts: 3,
  lockedUntil: new Date(Date.now() + 1000),
  forcePasswordChange: true,
  ...fields,
});
const post = (body) => request(app).post('/api/auth/busowner/resetPassword').send(body);

test('bus-owner password reset completion characterization', async (t) => {
  t.before(async () => db.connect());
  t.after(async () => db.disconnect());
  t.beforeEach(async () => db.clearAll());

  await t.test('required inputs, OTP length, missing user and non-owner responses', async () => {
    let res = await post({ phone: phone(1), otp: '123456' });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { success: false, message: 'Phone, OTP, and new password are required.' });
    res = await post({ phone: phone(2), otp: '12x', newPassword: credential() });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { success: false, message: 'Verification code must be 6 digits.' });
    res = await post({ phone: phone(3), otp: '123456', newPassword: credential() });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { success: false, message: 'Invalid OTP or phone number.' });
    await user(phone(4), { role: 'passenger', roles: ['passenger'] });
    res = await post({ phone: phone(4), otp: '123456', newPassword: credential() });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { success: false, message: 'Invalid OTP or phone number.' });
  });

  await t.test('OTP consume, salt/hash, mutations, revoke and increment order', async () => {
    const p = phone(5);
    const u = await user(p);
    const nextCredential = credential();
    const order = [];
    const restores = [
      patch(otpHelper, 'verifyOTPCode', async (otpPhone, otp, purpose, consume) => {
        order.push(`otp:${otpPhone}:${otp}:${purpose}:${consume}`); return { valid: true };
      }),
      patch(bcrypt, 'genSalt', async (cost) => { order.push(`salt:${cost}`); return 'salt'; }),
      patch(bcrypt, 'hash', async (pw, salt) => { order.push(`hash:${pw === nextCredential}:${salt}`); return 'hashed-value'; }),
      patch(tokenService, 'revokeAllUserTokens', async (id) => order.push(`revoke:${id}`)),
      patch(User, 'findByIdAndUpdate', async (id, update) => order.push(`inc:${id}:${update.$inc.tokenVersion}`)),
    ];
    try {
      const res = await post({ phone: p, otp: 'a123456', newPassword: nextCredential });
      assert.equal(res.status, 200);
      assert.deepEqual(res.body, { success: true, message: 'Password reset successful! You can now login.' });
      const fresh = await User.findById(u._id).select('+password');
      assert.equal(fresh.password, 'hashed-value');
      assert.equal(fresh.isVerified, true);
      assert.equal(fresh.failedLoginAttempts, 0);
      assert.equal(fresh.lockedUntil, null);
      assert.equal(fresh.forcePasswordChange, false);
      assert.deepEqual(order, [
        `otp:${p}:123456:BUSOWNER_PASSWORD_RESET:true`,
        'salt:10',
        `hash:true:salt`,
        `revoke:${u._id}`,
        `inc:${u._id}:1`,
      ]);
      assert.equal(res.body.accessToken, undefined);
    } finally { restores.reverse().forEach((fn) => fn()); }
  });

  await t.test('weak password fails after OTP consumption before persistence', async () => {
    const p = phone(6);
    await user(p);
    const order = [];
    const restores = [
      patch(otpHelper, 'verifyOTPCode', async () => { order.push('otp'); return { valid: true }; }),
      patch(validator, 'validatePassword', () => ({ valid: false, message: 'weak legacy' })),
      patch(bcrypt, 'genSalt', async () => order.push('salt')),
      patch(User.prototype, 'save', async () => order.push('save')),
      patch(tokenService, 'revokeAllUserTokens', async () => order.push('revoke')),
      patch(User, 'findByIdAndUpdate', async () => order.push('increment')),
    ];
    try {
      const res = await post({ phone: p, otp: '123456', newPassword: 'weak' });
      assert.equal(res.status, 400);
      assert.deepEqual(res.body, { success: false, message: 'weak legacy' });
      assert.deepEqual(order, ['otp']);
    } finally { restores.reverse().forEach((fn) => fn()); }
  });

  await t.test('invalid OTP and unexpected helper failure map exactly', async () => {
    const p = phone(7);
    await user(p);
    let restore = patch(otpHelper, 'verifyOTPCode', async () => ({ valid: false, error: 'bad otp' }));
    try {
      assert.deepEqual((await post({ phone: p, otp: '123456', newPassword: credential() })).body,
        { success: false, message: 'bad otp' });
    } finally { restore(); }
    restore = patch(otpHelper, 'verifyOTPCode', async () => { throw new Error('boom'); });
    try {
      const res = await post({ phone: p, otp: '123456', newPassword: credential() });
      assert.equal(res.status, 500);
      assert.deepEqual(res.body, { success: false, message: 'Internal Server Error' });
    } finally { restore(); }
  });
});
