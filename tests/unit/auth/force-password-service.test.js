'use strict';

process.env.SECRET_KEY = process.env.SECRET_KEY || 'test-only-secret-32chars-minimum!!';

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const otpHelper = require('../../../utils/otpHelper');
const passwordValidator = require('../../../utils/passwordValidator');
const tokenService = require('../../../utils/tokenService');
const repository = require('../../../src/modules/auth/force-password/force-password.repository');
const service = require('../../../src/modules/auth/force-password/force-password.service');

const patch = (obj, key, value, restores) => {
  const orig = obj[key];
  obj[key] = value;
  restores.push(() => { obj[key] = orig; });
};
const restoreAll = (restores) => restores.reverse().forEach((fn) => fn());

const appError = async (fn, status, body) => {
  await assert.rejects(fn, (err) => {
    assert.equal(err.statusCode, status);
    assert.deepEqual(err.responseBody, body);
    return true;
  });
};

test('force-password service validation, JWT, OTP and user state', async (t) => {
  await t.test('missing tempToken/newPassword use exact 400', async () => {
    await appError(() => service.changeForcePassword({ newPassword: 'Password1' }), 400, {
      success: false,
      message: 'Temp token and new password are required.',
    });
    await appError(() => service.changeForcePassword({ tempToken: 't' }), 400, {
      success: false,
      message: 'Temp token and new password are required.',
    });
  });

  await t.test('jwt.verify receives token and SECRET_KEY; decoded.id reaches repo', async () => {
    const r = [];
    const user = { _id: 'u1', forcePasswordChange: true };
    const fresh = { toObject: () => ({ _id: 'u1', password: 'x' }) };
    let repoId;
    try {
      patch(jwt, 'verify', (token, secret) => {
        assert.equal(token, 'tt');
        assert.equal(secret, process.env.SECRET_KEY);
        return { id: 'u1', purpose: 'FORCE_PASSWORD_CHANGE' };
      }, r);
      patch(passwordValidator, 'validatePassword', () => ({ valid: true, errors: [] }), r);
      patch(repository, 'findByIdWithPassword', async (id) => { repoId = id; return user; }, r);
      patch(bcrypt, 'hash', async () => 'hash', r);
      patch(repository, 'saveForcedPasswordChange', async () => {}, r);
      patch(tokenService, 'revokeAllUserTokens', async () => {}, r);
      patch(repository, 'incrementTokenVersion', async () => {}, r);
      patch(repository, 'findFreshUser', async () => fresh, r);
      patch(tokenService, 'generateTokenPair', async () => ({ accessToken: 'at' }), r);
      await service.changeForcePassword({ tempToken: 'tt', newPassword: 'Password1' });
      assert.equal(repoId, 'u1');
    } finally { restoreAll(r); }
  });

  await t.test('jwt failure and wrong purpose use exact 401s', async () => {
    const r = [];
    try {
      patch(jwt, 'verify', () => { throw new Error('bad jwt'); }, r);
      await appError(() => service.changeForcePassword({ tempToken: 'x', newPassword: 'Password1' }), 401, {
        success: false,
        message: 'Temp token is invalid or expired. Please login again.',
      });
      restoreAll(r); r.length = 0;
      patch(jwt, 'verify', () => ({ id: 'u1', purpose: 'OTHER' }), r);
      await appError(() => service.changeForcePassword({ tempToken: 'x', newPassword: 'Password1' }), 401, {
        success: false,
        message: 'Invalid token purpose.',
      });
    } finally { restoreAll(r); }
  });

  await t.test('weak password stops before OTP and repository lookup', async () => {
    const r = [];
    let otpCalled = false;
    let repoCalled = false;
    try {
      patch(jwt, 'verify', () => ({ id: 'u1', purpose: 'FORCE_PASSWORD_CHANGE' }), r);
      patch(passwordValidator, 'validatePassword', (p) => {
        assert.equal(p, 'weak');
        return { valid: false, errors: ['e1', 'e2'] };
      }, r);
      patch(otpHelper, 'verifyOTPCode', async () => { otpCalled = true; }, r);
      patch(repository, 'findByIdWithPassword', async () => { repoCalled = true; }, r);
      await appError(() => service.changeForcePassword({
        tempToken: 'x',
        newPassword: 'weak',
        phone: 'p',
        otp: 'o',
      }), 400, { success: false, message: 'e1', errors: ['e1', 'e2'] });
      assert.equal(otpCalled, false);
      assert.equal(repoCalled, false);
    } finally { restoreAll(r); }
  });

  await t.test('optional OTP is only verified when both phone and otp are truthy', async () => {
    const r = [];
    let calls = 0;
    try {
      patch(otpHelper, 'verifyOTPCode', async (phone, otp, purpose) => {
        calls += 1;
        assert.deepEqual([phone, otp, purpose], ['p', 'o', 'ACCOUNT_ACTIVATION']);
        return { valid: true };
      }, r);
      await otpHelper.verifyOTPCode('p', 'o', 'ACCOUNT_ACTIVATION');
      assert.equal(calls, 1);
    } finally { restoreAll(r); }
  });

  await t.test('user missing or forcePasswordChange false stops before hash', async () => {
    const r = [];
    let hashCalled = false;
    try {
      patch(jwt, 'verify', () => ({ id: 'u1', purpose: 'FORCE_PASSWORD_CHANGE' }), r);
      patch(passwordValidator, 'validatePassword', () => ({ valid: true, errors: [] }), r);
      patch(bcrypt, 'hash', async () => { hashCalled = true; }, r);
      patch(repository, 'findByIdWithPassword', async () => null, r);
      await appError(() => service.changeForcePassword({ tempToken: 'x', newPassword: 'Password1' }), 404, {
        success: false,
        message: 'User not found.',
      });
      restoreAll(r); r.length = 0;
      patch(jwt, 'verify', () => ({ id: 'u1', purpose: 'FORCE_PASSWORD_CHANGE' }), r);
      patch(passwordValidator, 'validatePassword', () => ({ valid: true, errors: [] }), r);
      patch(bcrypt, 'hash', async () => { hashCalled = true; }, r);
      patch(repository, 'findByIdWithPassword', async () => ({ forcePasswordChange: false }), r);
      await appError(() => service.changeForcePassword({ tempToken: 'x', newPassword: 'Password1' }), 400, {
        success: false,
        message: 'Password change is not required for this account.',
      });
      assert.equal(hashCalled, false);
    } finally { restoreAll(r); }
  });
});
