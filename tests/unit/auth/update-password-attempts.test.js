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
const appError = async (fn, status, body) => assert.rejects(fn, (err) => {
  assert.equal(err.statusCode, status);
  assert.deepEqual(err.responseBody, body);
  return true;
});

const base = (r, user) => {
  patch(passwordValidator, 'validatePassword', () => ({ valid: true, errors: [] }), r);
  patch(repository, 'findByIdWithPassword', async () => user, r);
};

test('update-password service attempts and success branches', async (t) => {
  await t.test('wrong password records one atomic attempt and stops downstream', async () => {
    const r = [];
    let hashCalled = false;
    try {
      base(r, { _id: 'u1', password: 'hash' });
      patch(bcrypt, 'compare', async () => false, r);
      patch(repository, 'recordFailedPasswordAttempt', async (id, lockDate) => {
        assert.equal(id, 'u1');
        assert.ok(lockDate.getTime() >= Date.now() + 15 * 60 * 1000 - 1000);
        return { failedLoginAttempts: 5 };
      }, r);
      patch(bcrypt, 'hash', async () => { hashCalled = true; }, r);
      await appError(() => service.updatePassword({
        userId: 'u1',
        oldPassword: 'bad',
        newPassword: 'NewPass1',
      }), 401, {
        success: false,
        message: 'Too many failed attempts. Account locked for 15 minutes and all sessions revoked.',
      });
      assert.equal(hashCalled, false);
    } finally { restore(r); }
  });

  await t.test('cleanup runs only when failed state exists and same-password compare follows', async () => {
    const r = [];
    const order = [];
    let compares = 0;
    try {
      base(r, { _id: 'u1', password: 'hash', failedLoginAttempts: 1, lockedUntil: null });
      patch(bcrypt, 'compare', async () => {
        compares += 1;
        order.push('compare');
        return compares === 1 || compares === 2;
      }, r);
      patch(repository, 'clearFailedPasswordState', async (id) => { order.push(`clear:${id}`); }, r);
      await appError(() => service.updatePassword({
        userId: 'u1',
        oldPassword: 'old',
        newPassword: 'OldPass1',
      }), 400, { status: false, message: 'New password must be different from current password' });
      assert.deepEqual(order, ['compare', 'clear:u1', 'compare']);
    } finally { restore(r); }
  });

  await t.test('successful path hashes with cost 12, updates, revokes, returns exact body', async () => {
    const r = [];
    const calls = [];
    try {
      base(r, { _id: 'u1', password: 'hash', failedLoginAttempts: 0, lockedUntil: null });
      patch(bcrypt, 'compare', async () => { calls.push('compare'); return calls.length === 1; }, r);
      patch(repository, 'clearFailedPasswordState', async () => { calls.push('clear'); }, r);
      patch(bcrypt, 'hash', async (p, cost) => {
        assert.deepEqual([p, cost], ['NewPass1', 12]);
        calls.push('hash');
        return 'new-hash';
      }, r);
      patch(repository, 'updatePasswordHash', async (id, h) => {
        assert.deepEqual([id, h], ['u1', 'new-hash']);
        calls.push('update');
      }, r);
      patch(tokenService, 'revokeAllUserTokens', async (id) => {
        assert.equal(id, 'u1');
        calls.push('revoke');
      }, r);
      const result = await service.updatePassword({
        userId: 'u1',
        oldPassword: 'old',
        newPassword: 'NewPass1',
      });
      assert.deepEqual(calls, ['compare', 'compare', 'hash', 'update', 'revoke']);
      assert.deepEqual(result, {
        statusCode: 200,
        responseBody: {
          status: true,
          message: 'Password updated successfully! Please login again on all devices.',
        },
      });
    } finally { restore(r); }
  });
});
