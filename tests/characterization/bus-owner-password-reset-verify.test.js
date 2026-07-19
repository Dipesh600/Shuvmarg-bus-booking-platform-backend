'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const db = require('../helpers/db');
const app = require('../helpers/app');
const otpHelper = require('../../utils/otpHelper');
const enumGuard = require('../../utils/enumGuard');

const patch = (obj, key, fn) => {
  const old = obj[key];
  obj[key] = fn;
  return () => { obj[key] = old; };
};
const post = (body) => request(app).post('/api/auth/busowner/verifyOtpForReset').send(body);

test('bus-owner password reset OTP verify characterization', async (t) => {
  t.before(async () => db.connect());
  t.after(async () => db.disconnect());
  t.beforeEach(async () => db.clearAll());

  await t.test('input validation and no token/session response are exact', async () => {
    let res = await post({});
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { success: false, message: 'Phone and OTP are required!' });
    res = await post({ phone: '9810000000', otp: '12-34' });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { success: false, message: 'Verification code must be 6 digits.' });
    res = await request(app).post('/api/auth/busowner/verifyOtpForReset')
      .set('Content-Type', 'text/plain').send('x');
    assert.equal(res.status, 500);
    assert.deepEqual(res.body, { success: false, message: 'Internal Server Error' });
  });

  await t.test('otpFirstVerify receives sanitized OTP, purpose and consume=false', async () => {
    const restore = patch(enumGuard, 'otpFirstVerify', async (p, otp, purpose, consume, verifyFn, lookup) => {
      assert.equal(p, '9810000000');
      assert.equal(otp, '123456');
      assert.equal(purpose, 'BUSOWNER_PASSWORD_RESET');
      assert.equal(consume, false);
      assert.equal(verifyFn, otpHelper.verifyOTPCode);
      assert.equal(await lookup('x'), null);
      return { valid: true, user: { roles: [], role: 'busOwner' } };
    });
    try {
      const res = await post({ phone: '9810000000', otp: '12-34 56' });
      assert.equal(res.status, 200);
      assert.deepEqual(res.body, { success: true, message: 'OTP verified. Proceed to reset password.' });
      assert.equal(res.body.resetToken, undefined);
      assert.equal(res.body.accessToken, undefined);
      assert.equal(res.body.refreshToken, undefined);
    } finally { restore(); }
  });

  await t.test('invalid OTP and non-busOwner role preserve generic response', async () => {
    let restore = patch(enumGuard, 'otpFirstVerify', async () => ({
      valid: false,
      error: 'Invalid or expired verification code.',
    }));
    try {
      const res = await post({ phone: '9810000000', otp: '123456' });
      assert.equal(res.status, 400);
      assert.deepEqual(res.body, { success: false, message: 'Invalid or expired verification code.' });
    } finally { restore(); }
    restore = patch(enumGuard, 'otpFirstVerify', async () => ({
      valid: true,
      user: { roles: ['passenger'], role: 'busOwner' },
    }));
    try {
      const res = await post({ phone: '9810000000', otp: '123456' });
      assert.equal(res.status, 400);
      assert.deepEqual(res.body, { success: false, message: 'Invalid or expired verification code.' });
    } finally { restore(); }
  });

  await t.test('legacy role fallback and unexpected error are preserved', async () => {
    let restore = patch(enumGuard, 'otpFirstVerify', async () => ({
      valid: true,
      user: { roles: [], role: 'busOwner' },
    }));
    try {
      assert.equal((await post({ phone: '9810000000', otp: '123456' })).status, 200);
    } finally { restore(); }
    restore = patch(enumGuard, 'otpFirstVerify', async () => { throw new Error('boom'); });
    try {
      const res = await post({ phone: '9810000000', otp: '123456' });
      assert.equal(res.status, 500);
      assert.deepEqual(res.body, { success: false, message: 'Internal Server Error' });
    } finally { restore(); }
  });
});
