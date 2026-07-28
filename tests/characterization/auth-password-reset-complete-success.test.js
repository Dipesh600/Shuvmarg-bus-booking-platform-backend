'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const request = require('supertest');
const app = require('../helpers/app');
const db = require('../helpers/db');
const User = require('../../models/userModel');
const OTP = require('../../models/otpModel');
const RefreshToken = require('../../models/refreshTokenModel');
const tokenService = require('../../utils/tokenService');

const OLD_PASSWORD = 'OldPass1';
const NEW_PASSWORD = 'NewPass1';
const seedUser = (phone) => User.create({
  name: 'Reset Success', phone, password: OLD_PASSWORD, role: 'passenger',
  roles: ['passenger'], isVerified: true, deletedAt: null,
});
const seedOtp = async (phone, code) => {
  const otp = crypto.createHmac('sha256', process.env.SECRET_KEY).update(code).digest('hex');
  await OTP.findOneAndUpdate(
    { phone, purpose: 'PASSWORD_RESET' },
    { otp, otpExpiry: new Date(Date.now() + 300000), isUsed: false, attempts: 0, sendCount: 1, maxAttempts: 5 },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};
const reset = (body) => request(app).post('/api/resetPassword').send(body);

test('Auth: resetPassword success and failure contracts', async (t) => {
  await db.connect();
  t.after(() => db.disconnect());
  t.beforeEach(() => db.clearAll());

  await t.test('successful reset preserves the complete contract', async () => {
    const phone = '9800002210';
    const user = await seedUser(phone);
    const beforeVersion = user.tokenVersion || 0;
    await RefreshToken.create({
      userId: user._id, tokenHash: 'reset-token',
      expiresAt: new Date(Date.now() + 60000),
    });
    await seedOtp(phone, '666777');

    const res = await reset({ emailOrPhone: phone, otp: '666777', newPassword: NEW_PASSWORD });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, {
      status: true,
      message: 'Password reset successful. Please log in with your new password.',
    });

    const stored = await User.findOne({ phone }).select('+password');
    assert.notEqual(stored.password, NEW_PASSWORD);
    assert.equal(await bcrypt.compare(NEW_PASSWORD, stored.password), true);
    assert.equal(await bcrypt.compare(OLD_PASSWORD, stored.password), false);
    assert.equal(await RefreshToken.countDocuments({ userId: user._id }), 0);
    assert.equal(stored.tokenVersion, beforeVersion + 1);
  });

  await t.test('OTP sanitation strips non-digits and succeeds', async () => {
    const phone = '9800002215';
    await seedUser(phone); await seedOtp(phone, '123456');
    const res = await reset({ emailOrPhone: phone, otp: '123-456 ', newPassword: NEW_PASSWORD });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, true);
  });

  await t.test('unexpected revocation failure -> exact legacy 500', async () => {
    const phone = '9800002216';
    await seedUser(phone); await seedOtp(phone, '234567');
    const original = tokenService.revokeAllUserTokens;
    tokenService.revokeAllUserTokens = async () => { throw new Error('revocation crash'); };
    try {
      const res = await reset({ emailOrPhone: phone, otp: '234567', newPassword: NEW_PASSWORD });
      assert.equal(res.status, 500);
      assert.deepEqual(res.body, {
        status: false,
        message: 'Failed to reset password. Please try again.',
      });
    } finally {
      tokenService.revokeAllUserTokens = original;
    }
  });
});
