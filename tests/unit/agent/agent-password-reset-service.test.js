'use strict';

process.env.SECRET_KEY ||= 'test-only-secret-32chars-minimum!!';

const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const phoneGuard = require('../../../utils/phoneGuard');
const otpHelper = require('../../../utils/otpHelper');
const enumGuard = require('../../../utils/enumGuard');
const passwordValidator = require('../../../utils/passwordValidator');
const tokenService = require('../../../utils/tokenService');
const repository = require('../../../src/modules/agent/auth/password-reset/agent-password-reset.repository');
const service = require('../../../src/modules/agent/auth/password-reset/agent-password-reset.service');

const patch = (obj, key, fn, restores) => {
  const old = obj[key];
  obj[key] = fn;
  restores.push(() => { obj[key] = old; });
};
const assertBody = async (promise, code, body) => {
  await assert.rejects(promise, (e) => {
    assert.equal(e.statusCode, code);
    assert.deepEqual(e.responseBody, body);
    return true;
  });
};
const user = () => ({
  _id: 'u1',
  phone: '9818700001',
  role: 'agent',
  roles: ['agent'],
  status: 'active',
  isVerified: false,
  phoneVerified: false,
  tokenVersion: 0,
  failedLoginAttempts: 2,
  lockedUntil: new Date(),
  forcePasswordChange: true,
  save: async () => {},
  toObject() { return { ...this }; },
});

test('agent password reset service preserves orchestration', async (t) => {
  await t.test('request normalizes, pads and sends the recovery OTP without enumeration', async () => {
    const restores = [];
    const order = [];
    patch(phoneGuard, 'normalizePhone', (p) => { order.push(`normalize:${p}`); return '9818700001'; }, restores);
    patch(enumGuard, 'withMinimumLatency', async (fn, ms) => { order.push(`latency:${ms}`); return fn(); }, restores);
    patch(repository, 'findUserByPhone', async (p) => {
      order.push(`find:${p}`);
      return { phone: p, roles: ['agent'], status: 'active' };
    }, restores);
    patch(otpHelper, 'createAndSendOTP', async (p, purpose) => order.push(`otp:${p}:${purpose}`), restores);
    try {
      const result = await service.requestPasswordReset({ rawPhone: '+9779818700001' });
      assert.deepEqual(order, [
        'normalize:+9779818700001', 'latency:600', 'find:9818700001',
        'otp:9818700001:AGENT_PASSWORD_RESET',
      ]);
      assert.equal(result.statusCode, 200);
    } finally { restores.reverse().forEach((fn) => fn()); }
  });

  await t.test('verify OTP uses otpFirstVerify consume=false before agent role response', async () => {
    const restores = [];
    patch(phoneGuard, 'normalizePhone', () => '9818700002', restores);
    patch(enumGuard, 'otpFirstVerify', async (p, otp, purpose, consume, verifyFn, lookup) => {
      assert.equal(p, '9818700002'); assert.equal(otp, '123456');
      assert.equal(purpose, 'AGENT_PASSWORD_RESET'); assert.equal(consume, false);
      assert.equal(verifyFn, otpHelper.verifyOTPCode);
      assert.equal(await lookup('x'), 'found');
      return { valid: true, user: { roles: [], role: 'agent', status: 'invited' } };
    }, restores);
    patch(repository, 'findUserByPhone', async () => 'found', restores);
    try {
      const result = await service.verifyOtpForReset({ rawPhone: 'x', otp: 'a123456' });
      assert.equal(result.statusCode, 200);
    } finally { restores.reverse().forEach((fn) => fn()); }
  });

  await t.test('reset consumes OTP, activates invited state and creates a fresh session', async () => {
    const restores = [];
    const u = user();
    const order = [];
    patch(phoneGuard, 'normalizePhone', () => u.phone, restores);
    u.status = 'invited';
    patch(repository, 'findUserByPhone', async () => u, restores);
    patch(enumGuard, 'otpFirstVerify', async (p, otp, purpose, consume, verifyFn, lookup) => {
      order.push(`otp:${p}:${otp}:${purpose}:${consume}`);
      assert.equal(verifyFn, otpHelper.verifyOTPCode);
      assert.equal(await lookup(p), u);
      return { valid: true, user: u };
    }, restores);
    patch(passwordValidator, 'validatePassword', (pw) => { order.push(`validate:${pw}`); return { valid: true }; }, restores);
    patch(bcrypt, 'genSalt', async (cost) => { order.push(`salt:${cost}`); return 'salt'; }, restores);
    patch(bcrypt, 'hash', async (pw, salt) => { order.push(`hash:${pw}:${salt}`); return 'hash'; }, restores);
    patch(repository, 'completePasswordReset', async (input) => {
      order.push(`complete:${input.expectedStatus}:${input.hashedPassword}`);
      u.status = 'active'; u.phoneVerified = true; u.isVerified = true;
      u.failedLoginAttempts = 0; u.lockedUntil = null;
      u.forcePasswordChange = false; u.tokenVersion = 1;
      return u;
    }, restores);
    patch(tokenService, 'revokeAllUserTokens', async (id) => { order.push(`revoke:${id}`); }, restores);
    patch(tokenService, 'generateTokenPair', async (_, meta) => {
      order.push(`session:${meta.activeRole}`);
      return { accessToken: 'access', refreshToken: 'refresh' };
    }, restores);
    try {
      const result = await service.resetPassword({ rawPhone: u.phone, otp: '123456', newPassword: 'NewPass123!' });
      assert.equal(result.statusCode, 200);
      assert.deepEqual(order, [
        'validate:NewPass123!', 'otp:9818700001:123456:AGENT_PASSWORD_RESET:true',
        'salt:12', 'hash:NewPass123!:salt', 'complete:invited:hash',
        'revoke:u1', 'session:agent',
      ]);
      assert.equal(u.failedLoginAttempts, 0);
      assert.equal(u.lockedUntil, null);
      assert.equal(u.forcePasswordChange, false);
      assert.equal(u.phoneVerified, true);
      assert.equal(u.status, 'active');
      assert.equal(result.responseBody.accessToken, 'access');
      assert.equal(result.refreshToken, 'refresh');
    } finally { restores.reverse().forEach((fn) => fn()); }
  });

  await t.test('expected failures and OTP blocked mapping preserve contracts', async () => {
    await assertBody(service.verifyOtpForReset({ rawPhone: '', otp: '123456' }), 400, {
      success: false, message: 'Phone and OTP are required.',
    });
    await assertBody(service.resetPassword({ rawPhone: '9818700001', otp: '12', newPassword: 'x' }), 400, {
      success: false, message: 'Verification code must be 6 digits.',
    });
    const restores = [];
    patch(phoneGuard, 'normalizePhone', () => '9818700001', restores);
    patch(enumGuard, 'withMinimumLatency', async () => { throw new Error('OTP_SEND_BLOCKED:11'); }, restores);
    try {
      await assertBody(service.requestPasswordReset({ rawPhone: 'x' }), 429, {
        success: false,
        message: 'Too many OTP requests. Please wait 11 minute(s) before trying again.',
        errorCode: 'OTP_SEND_BLOCKED',
        retryAfterMinutes: 11,
      });
    } finally { restores.reverse().forEach((fn) => fn()); }
  });
});
