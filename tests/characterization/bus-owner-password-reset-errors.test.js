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
const enumGuard = require('../../utils/enumGuard');
const tokenService = require('../../utils/tokenService');
const repository = require('../../src/modules/bus-owner/auth/password-reset/bus-owner-password-reset.repository');

const patch = (obj, key, fn) => {
  const old = obj[key];
  obj[key] = fn;
  return () => { obj[key] = old; };
};
const phone = (n) => `98230${String(n).padStart(5, '0')}`;
const credential = () => `${crypto.randomBytes(24).toString('hex')}A1`;
const user = (p) => User.create({
  name: 'Bus Error',
  phone: p,
  password: bcrypt.hashSync(credential(), 10),
  role: 'busOwner',
  roles: ['busOwner'],
  status: 'active',
});

test('bus-owner password reset route-level generic error contracts', async (t) => {
  t.before(async () => db.connect());
  t.after(async () => db.disconnect());
  t.beforeEach(async () => db.clearAll());

  await t.test('request repository and verify otpFirst failures use endpoint bodies', async () => {
    let restore = patch(repository, 'findUserByPhone', async () => { throw new Error('db'); });
    try {
      let res = await request(app).post('/api/auth/busowner/requestPasswordReset').send({ phone: phone(1) });
      assert.equal(res.status, 500);
      assert.deepEqual(res.body, { success: false, message: 'Failed to send OTP. Please try again.' });
    } finally { restore(); }
    restore = patch(enumGuard, 'otpFirstVerify', async () => { throw new Error('verify'); });
    try {
      const res = await request(app).post('/api/auth/busowner/verifyOtpForReset').send({ phone: phone(1), otp: '123456' });
      assert.equal(res.status, 500);
      assert.deepEqual(res.body, { success: false, message: 'Internal Server Error' });
    } finally { restore(); }
  });

  await t.test('reset save, revoke and increment failures are generic after prior writes', async () => {
    const p = phone(2);
    const u = await user(p);
    let restoreOtp = patch(otpHelper, 'verifyOTPCode', async () => ({ valid: true }));
    let restoreSave = patch(User.prototype, 'save', async () => { throw new Error('save'); });
    try {
      let res = await request(app).post('/api/auth/busowner/resetPassword')
        .send({ phone: p, otp: '123456', newPassword: credential() });
      assert.equal(res.status, 500);
      assert.deepEqual(res.body, { success: false, message: 'Internal Server Error' });
    } finally { restoreSave(); restoreOtp(); }
    restoreOtp = patch(otpHelper, 'verifyOTPCode', async () => ({ valid: true }));
    let restoreRevoke = patch(tokenService, 'revokeAllUserTokens', async () => { throw new Error('revoke'); });
    try {
      const res = await request(app).post('/api/auth/busowner/resetPassword')
        .send({ phone: p, otp: '123456', newPassword: credential() });
      assert.equal(res.status, 500);
      assert.equal((await User.findById(u._id)).failedLoginAttempts, 0);
    } finally { restoreRevoke(); restoreOtp(); }
    restoreOtp = patch(otpHelper, 'verifyOTPCode', async () => ({ valid: true }));
    const restoreInc = patch(User, 'findByIdAndUpdate', async () => { throw new Error('inc'); });
    try {
      const res = await request(app).post('/api/auth/busowner/resetPassword')
        .send({ phone: p, otp: '123456', newPassword: credential() });
      assert.equal(res.status, 500);
    } finally { restoreInc(); restoreOtp(); }
  });

  await t.test('resend repository failure uses resend generic body', async () => {
    const restore = patch(repository, 'findUserByPhone', async () => { throw new Error('db'); });
    try {
      const res = await request(app).post('/api/auth/busowner/resendOtpForReset').send({ phone: phone(3) });
      assert.equal(res.status, 500);
      assert.deepEqual(res.body, { success: false, message: 'Failed to resend code. Please try again.' });
    } finally { restore(); }
  });
});
