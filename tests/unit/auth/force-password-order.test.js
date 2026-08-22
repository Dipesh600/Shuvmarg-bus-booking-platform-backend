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

test('force-password service preserves successful operation sequence', async () => {
  const r = [];
  const order = [];
  const user = { _id: 'u1', forcePasswordChange: true };
  const freshUser = {
    _id: 'u1',
    role: 'passenger',
    toObject: () => {
      order.push('toObject');
      return { _id: 'u1', password: 'secret', keep: true };
    },
  };
  try {
    patch(jwt, 'verify', (token, secret) => {
      order.push('jwt');
      assert.deepEqual([token, secret], ['temp', process.env.SECRET_KEY]);
      return { id: 'u1', purpose: 'FORCE_PASSWORD_CHANGE' };
    }, r);
    patch(passwordValidator, 'validatePassword', (password) => {
      order.push('validate');
      assert.equal(password, 'Password1');
      return { valid: true, errors: [] };
    }, r);
    patch(otpHelper, 'verifyOTPCode', async (phone, otp, purpose) => {
      order.push('otp');
      assert.deepEqual([phone, otp, purpose], ['9800000000', '123456', 'ACCOUNT_ACTIVATION']);
      return { valid: true };
    }, r);
    patch(repository, 'findByIdWithPassword', async (id) => {
      order.push('find-user');
      assert.equal(id, 'u1');
      return user;
    }, r);
    patch(bcrypt, 'hash', async (password, cost) => {
      order.push('hash');
      assert.deepEqual([password, cost], ['Password1', 12]);
      return 'hashed';
    }, r);
    patch(repository, 'saveForcedPasswordChange', async (savedUser, hash, options) => {
      order.push('save');
      assert.equal(savedUser, user);
      assert.equal(hash, 'hashed');
      assert.deepEqual(options, { credentialVersion: undefined, phoneVerified: true });
      savedUser.password = hash;
      savedUser.forcePasswordChange = false;
      savedUser.phoneVerified = true;
      return savedUser;
    }, r);
    patch(tokenService, 'revokeAllUserTokens', async (id) => {
      order.push('revoke');
      assert.equal(id, 'u1');
    }, r);
    patch(repository, 'findFreshUser', async (id) => {
      order.push('refetch');
      assert.equal(id, 'u1');
      return freshUser;
    }, r);
    patch(tokenService, 'generateTokenPair', async (fresh, meta) => {
      order.push('generate');
      assert.equal(fresh, freshUser);
      assert.deepEqual(meta, { deviceInfo: 'UA', ipAddress: 'ip', activeRole: 'passenger' });
      return { accessToken: 'at', refreshToken: 'rt' };
    }, r);

    const result = await service.changeForcePassword({
      tempToken: 'temp',
      newPassword: 'Password1',
      phone: '9800000000',
      otp: '123456',
      deviceInfo: 'UA',
      ipAddress: 'ip',
    });

    assert.deepEqual(order, [
      'jwt',
      'validate',
      'otp',
      'find-user',
      'hash',
      'save',
      'revoke',
      'refetch',
      'generate',
      'toObject',
    ]);
    assert.equal(result.activeRole, 'passenger');
    assert.equal(user.forcePasswordChange, false);
    assert.equal(user.phoneVerified, true);
    assert.equal(result.refreshToken, 'rt');
    assert.equal(result.responseBody.refreshToken, undefined);
    assert.deepEqual(result.responseBody.user, { _id: 'u1', keep: true });
  } finally { restoreAll(r); }
});
