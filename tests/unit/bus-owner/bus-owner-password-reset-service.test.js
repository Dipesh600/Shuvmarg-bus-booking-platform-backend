'use strict';

process.env.SECRET_KEY ||= 'test-only-secret-32chars-minimum!!';

const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const phoneGuard = require('../../../utils/phoneGuard');
const otpHelper = require('../../../utils/otpHelper');
const enumGuard = require('../../../utils/enumGuard');
const validator = require('../../../utils/passwordValidator');
const tokenService = require('../../../utils/tokenService');
const repository = require('../../../src/modules/bus-owner/auth/password-reset/bus-owner-password-reset.repository');
const service = require('../../../src/modules/bus-owner/auth/password-reset/bus-owner-password-reset.service');

const patch = (obj, key, fn, restore) => {
  const old = obj[key];
  obj[key] = fn;
  restore.push(() => { obj[key] = old; });
};
const user = (x = {}) => ({
  _id: 'u1',
  phone: 'stored-phone',
  roles: ['busOwner'],
  role: 'passenger',
  isVerified: false,
  save: async () => {},
  ...x,
});

test('bus-owner password-reset service preserves orchestration', async (t) => {
  await t.test('request uses latency wrapper, lookup, role check and stored phone OTP', async () => {
    const restore = [];
    const order = [];
    patch(phoneGuard, 'normalizePhone', (p) => { order.push(`normalize:${p}`); return '9800000000'; }, restore);
    patch(enumGuard, 'withMinimumLatency', async (fn, ms) => { order.push(`latency:${ms}`); return fn(); }, restore);
    patch(repository, 'findUserByPhone', async (p) => { order.push(`find:${p}`); return user(); }, restore);
    patch(phoneGuard, 'checkPhoneForRole', async (p, r) => { order.push(`role:${p}:${r}`); return { hasRole: true }; }, restore);
    patch(otpHelper, 'createAndSendOTP', async (p, purpose) => order.push(`otp:${p}:${purpose}`), restore);
    try {
      const result = await service.requestPasswordReset({ rawPhone: 'raw' });
      assert.deepEqual(order, [
        'normalize:raw', 'latency:600', 'find:9800000000',
        'role:9800000000:busOwner', 'otp:stored-phone:BUSOWNER_PASSWORD_RESET',
      ]);
      assert.equal(result.responseBody.message, 'If an account exists, OTP has been sent.');
    } finally { restore.reverse().forEach((fn) => fn()); }
  });

  await t.test('verify uses otpFirstVerify consume=false before role resolution', async () => {
    const restore = [];
    const order = [];
    patch(phoneGuard, 'normalizePhone', () => '9800000000', restore);
    patch(enumGuard, 'otpFirstVerify', async (phone, otp, purpose, consume, verifyFn, lookup) => {
      order.push(`${phone}:${otp}:${purpose}:${consume}:${verifyFn === otpHelper.verifyOTPCode}`);
      await lookup(phone);
      return { valid: true, user: user({ roles: [], role: 'busOwner' }) };
    }, restore);
    patch(repository, 'findUserByPhone', async (p) => { order.push(`lookup:${p}`); return user(); }, restore);
    try {
      const result = await service.verifyOtpForReset({ rawPhone: 'p', otp: '12-34-56' });
      assert.deepEqual(order, ['9800000000:123456:BUSOWNER_PASSWORD_RESET:false:true', 'lookup:9800000000']);
      assert.equal(result.responseBody.message, 'OTP verified. Proceed to reset password.');
    } finally { restore.reverse().forEach((fn) => fn()); }
  });

  await t.test('complete reset consumes OTP before validation and preserves save revoke increment order', async () => {
    const restore = [];
    const order = [];
    const u = user();
    patch(phoneGuard, 'normalizePhone', () => '9800000000', restore);
    patch(repository, 'findUserByPhone', async () => { order.push('find'); return u; }, restore);
    patch(phoneGuard, 'checkPhoneForRole', async () => { order.push('role'); return { hasRole: true }; }, restore);
    patch(otpHelper, 'verifyOTPCode', async (p, o, purpose, consume) => {
      order.push(`otp:${p}:${o}:${purpose}:${consume}`); return { valid: true };
    }, restore);
    patch(validator, 'validatePassword', () => { order.push('validate'); return { valid: true }; }, restore);
    patch(bcrypt, 'genSalt', async (cost) => { order.push(`salt:${cost}`); return 'salt'; }, restore);
    patch(bcrypt, 'hash', async (pw, salt) => { order.push(`hash:${pw}:${salt}`); return 'hash'; }, restore);
    patch(repository, 'saveUser', async () => { order.push('save'); }, restore);
    patch(tokenService, 'revokeAllUserTokens', async (id) => { order.push(`revoke:${id}`); }, restore);
    patch(repository, 'incrementTokenVersion', async (id) => { order.push(`increment:${id}`); }, restore);
    try {
      const result = await service.resetPassword({ rawPhone: 'p', otp: '12-34-56', newPassword: 'new' });
      assert.deepEqual(order, [
        'find', 'role', 'otp:stored-phone:123456:BUSOWNER_PASSWORD_RESET:true',
        'validate', 'salt:10', 'hash:new:salt', 'save', 'revoke:u1', 'increment:u1',
      ]);
      assert.equal(u.password, 'hash');
      assert.equal(u.isVerified, true);
      assert.equal(u.failedLoginAttempts, 0);
      assert.equal(u.lockedUntil, null);
      assert.equal(u.forcePasswordChange, false);
      assert.equal(result.responseBody.message, 'Password reset successful! You can now login.');
    } finally { restore.reverse().forEach((fn) => fn()); }
  });

  await t.test('invalid password stops before hashing, save and token invalidation', async () => {
    const restore = [];
    const order = [];
    patch(phoneGuard, 'normalizePhone', () => '9800000000', restore);
    patch(repository, 'findUserByPhone', async () => user(), restore);
    patch(phoneGuard, 'checkPhoneForRole', async () => ({ hasRole: true }), restore);
    patch(otpHelper, 'verifyOTPCode', async () => { order.push('otp'); return { valid: true }; }, restore);
    patch(validator, 'validatePassword', () => { order.push('validate'); return { valid: false, message: 'weak' }; }, restore);
    patch(bcrypt, 'genSalt', async () => order.push('salt'), restore);
    patch(repository, 'saveUser', async () => order.push('save'), restore);
    patch(tokenService, 'revokeAllUserTokens', async () => order.push('revoke'), restore);
    try {
      await assert.rejects(() => service.resetPassword({ rawPhone: 'p', otp: '123456', newPassword: 'weak' }), {
        statusCode: 400,
        responseBody: { success: false, message: 'weak' },
      });
      assert.deepEqual(order, ['otp', 'validate']);
    } finally { restore.reverse().forEach((fn) => fn()); }
  });

  await t.test('resend checks suspension only after confirmed busOwner role', async () => {
    const restore = [];
    const order = [];
    patch(phoneGuard, 'normalizePhone', () => '9800000000', restore);
    patch(repository, 'findUserByPhone', async () => { order.push('find'); return user({ status: 'active' }); }, restore);
    patch(phoneGuard, 'checkPhoneForRole', async () => { order.push('role'); return { hasRole: true }; }, restore);
    patch(otpHelper, 'createAndSendOTP', async (p, purpose) => {
      order.push(`otp:${p}:${purpose}`); return { expiresIn: 300 };
    }, restore);
    try {
      const result = await service.resendOtpForReset({ rawPhone: 'p' });
      assert.deepEqual(order, ['find', 'role', 'otp:9800000000:BUSOWNER_PASSWORD_RESET']);
      assert.deepEqual(result.responseBody.data, { expiresIn: 300 });
    } finally { restore.reverse().forEach((fn) => fn()); }
  });
});
