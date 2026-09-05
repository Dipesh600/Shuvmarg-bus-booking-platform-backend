'use strict';

process.env.SECRET_KEY = process.env.SECRET_KEY || 'test-only-secret-32chars-minimum!!';

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
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

const assert500 = async (fn) => {
  await assert.rejects(fn, (err) => {
    assert.equal(err.statusCode, 500);
    assert.deepEqual(err.responseBody, {
      success: false,
      message: 'Internal Server Error',
    });
    assert.ok(err.cause);
    return true;
  });
};

const setup = (failAt) => {
  const r = [];
  const order = [];
  const user = { _id: 'u1', forcePasswordChange: true, roles: ['passenger'] };
  const fresh = { _id: 'u1', toObject: () => {
    order.push('toObject');
    if (failAt === 'toObject') throw new Error('toObject failed');
    return { _id: 'u1' };
  } };
  patch(jwt, 'verify', () => ({ id: 'u1', purpose: 'FORCE_PASSWORD_CHANGE', activeRole: 'passenger', credentialVersion: 0, tokenVersion: 0 }), r);
  patch(passwordValidator, 'validatePassword', () => ({ valid: true, errors: [] }), r);
  patch(repository, 'findByIdWithPassword', async () => user, r);
  patch(bcrypt, 'hash', async () => {
    order.push('hash');
    if (failAt === 'hash') throw new Error('hash failed');
    return 'hash';
  }, r);
  patch(repository, 'saveForcedPasswordChange', async () => {
    order.push('save');
    if (failAt === 'save') throw new Error('save failed');
    return user;
  }, r);
  patch(tokenService, 'revokeAllUserTokens', async () => {
    order.push('revoke');
    if (failAt === 'revoke') throw new Error('revoke failed');
  }, r);
  patch(repository, 'findFreshUser', async () => {
    order.push('refetch');
    if (failAt === 'refetch') throw new Error('refetch failed');
    return fresh;
  }, r);
  patch(tokenService, 'generateTokenPair', async () => {
    order.push('generate');
    if (failAt === 'generate') throw new Error('generate failed');
    return { accessToken: 'at', refreshToken: 'rt' };
  }, r);
  return { r, order };
};

test('force-password service unexpected failures map to legacy 500 and stop downstream', async (t) => {
  const cases = [
    ['hash', ['hash']],
    ['save', ['hash', 'save']],
    ['revoke', ['hash', 'save', 'revoke']],
    ['refetch', ['hash', 'save', 'revoke', 'refetch']],
    ['generate', ['hash', 'save', 'revoke', 'refetch', 'generate']],
    ['toObject', ['hash', 'save', 'revoke', 'refetch', 'generate', 'toObject']],
  ];

  for (const [stage, expected] of cases) {
    await t.test(stage, async () => {
      const { r, order } = setup(stage);
      try {
        await assert500(() => service.changeForcePassword({
          tempToken: 't',
          newPassword: 'Password1',
        }));
        assert.deepEqual(order, expected);
      } finally { restoreAll(r); }
    });
  }
});
