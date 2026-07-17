'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const tokenService = require('../../../utils/tokenService');
const passwordValidator = require('../../../utils/passwordValidator');
const repository = require('../../../src/modules/auth/update-password/update-password.repository');
const service = require('../../../src/modules/auth/update-password/update-password.service');

const patch = (obj, key, value, r) => {
  const orig = obj[key];
  obj[key] = value;
  r.push(() => { obj[key] = orig; });
};
const restore = (r) => r.reverse().forEach((fn) => fn());

const assert500 = async (fn) => assert.rejects(fn, (err) => {
  assert.equal(err.statusCode, 500);
  assert.deepEqual(err.responseBody, { status: false, message: 'Internal server error' });
  assert.ok(err.cause);
  return true;
});

const setup = (failAt) => {
  const r = [];
  const order = [];
  const user = { _id: 'u1', password: 'hash', failedLoginAttempts: 1, lockedUntil: null };
  patch(passwordValidator, 'validatePassword', () => {
    order.push('validate');
    if (failAt === 'validate') throw new Error('validate failed');
    return { valid: true, errors: [] };
  }, r);
  patch(repository, 'findByIdWithPassword', async () => {
    order.push('lookup');
    if (failAt === 'lookup') throw new Error('lookup failed');
    return user;
  }, r);
  let compareCount = 0;
  patch(bcrypt, 'compare', async () => {
    compareCount += 1;
    order.push(compareCount === 1 ? 'compare-old' : 'compare-new');
    if (failAt === 'compare-old' && compareCount === 1) throw new Error('old compare failed');
    if (failAt === 'compare-new' && compareCount === 2) throw new Error('new compare failed');
    return compareCount === 1;
  }, r);
  patch(repository, 'recordFailedPasswordAttempt', async () => {
    order.push('record');
    if (failAt === 'record') throw new Error('record failed');
    return { failedLoginAttempts: 1 };
  }, r);
  patch(repository, 'clearFailedPasswordState', async () => {
    order.push('clear');
    if (failAt === 'clear') throw new Error('clear failed');
  }, r);
  patch(bcrypt, 'hash', async () => {
    order.push('hash');
    if (failAt === 'hash') throw new Error('hash failed');
    return 'new-hash';
  }, r);
  patch(repository, 'updatePasswordHash', async () => {
    order.push('update');
    if (failAt === 'update') throw new Error('update failed');
  }, r);
  patch(tokenService, 'revokeAllUserTokens', async () => {
    order.push('revoke');
    if (failAt === 'revoke') throw new Error('revoke failed');
  }, r);
  return { r, order };
};

test('update-password service unexpected failures map to legacy 500', async (t) => {
  const cases = [
    ['validate', ['validate']],
    ['lookup', ['validate', 'lookup']],
    ['compare-old', ['validate', 'lookup', 'compare-old']],
    ['clear', ['validate', 'lookup', 'compare-old', 'clear']],
    ['compare-new', ['validate', 'lookup', 'compare-old', 'clear', 'compare-new']],
    ['hash', ['validate', 'lookup', 'compare-old', 'clear', 'compare-new', 'hash']],
    ['update', ['validate', 'lookup', 'compare-old', 'clear', 'compare-new', 'hash', 'update']],
    ['revoke', ['validate', 'lookup', 'compare-old', 'clear', 'compare-new', 'hash', 'update', 'revoke']],
  ];
  for (const [stage, expected] of cases) {
    await t.test(stage, async () => {
      const { r, order } = setup(stage);
      try {
        await assert500(() => service.updatePassword({
          userId: 'u1',
          oldPassword: 'OldPass1',
          newPassword: 'NewPass1',
        }));
        assert.deepEqual(order, expected);
      } finally { restore(r); }
    });
  }

  await t.test('failed-attempt update failure stops downstream', async () => {
    const r = [];
    const order = [];
    try {
      patch(passwordValidator, 'validatePassword', () => ({ valid: true, errors: [] }), r);
      patch(repository, 'findByIdWithPassword', async () => ({ _id: 'u1', password: 'hash' }), r);
      patch(bcrypt, 'compare', async () => { order.push('compare-old'); return false; }, r);
      patch(repository, 'recordFailedPasswordAttempt', async () => {
        order.push('record');
        throw new Error('record failed');
      }, r);
      patch(bcrypt, 'hash', async () => { order.push('hash'); }, r);
      await assert500(() => service.updatePassword({
        userId: 'u1',
        oldPassword: 'bad',
        newPassword: 'NewPass1',
      }));
      assert.deepEqual(order, ['compare-old', 'record']);
    } finally { restore(r); }
  });
});
