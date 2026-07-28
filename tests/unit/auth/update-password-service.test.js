'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const passwordValidator = require('../../../utils/passwordValidator');
const repository = require('../../../src/modules/auth/update-password/update-password.repository');
const service = require('../../../src/modules/auth/update-password/update-password.service');

const patch = (obj, key, value, r) => {
  const orig = obj[key];
  obj[key] = value;
  r.push(() => { obj[key] = orig; });
};
const restore = (r) => r.reverse().forEach((fn) => fn());
const appError = async (fn, status, body) => {
  await assert.rejects(fn, (err) => {
    assert.equal(err.statusCode, status);
    assert.deepEqual(err.responseBody, body);
    return true;
  });
};

test('update-password service validation and lookup', async (t) => {
  await t.test('missing userId/oldPassword/newPassword exact errors', async () => {
    await appError(() => service.updatePassword({ oldPassword: 'a', newPassword: 'NewPass1' }), 401, {
      status: false,
      message: 'Unauthorized: User not authenticated',
    });
    await appError(() => service.updatePassword({ userId: 'u', newPassword: 'NewPass1' }), 400, {
      status: false,
      message: 'Both old password and new password are required',
    });
    await appError(() => service.updatePassword({ userId: 'u', oldPassword: 'a' }), 400, {
      status: false,
      message: 'Both old password and new password are required',
    });
  });

  await t.test('weak password validates before repository lookup', async () => {
    const r = [];
    let repoCalled = false;
    try {
      patch(passwordValidator, 'validatePassword', (p) => {
        assert.equal(p, 'weak');
        return { valid: false, errors: ['e1', 'e2'] };
      }, r);
      patch(repository, 'findByIdWithPassword', async () => { repoCalled = true; }, r);
      await appError(() => service.updatePassword({
        userId: 'u',
        oldPassword: 'old',
        newPassword: 'weak',
      }), 400, { status: false, message: 'e1', errors: ['e1', 'e2'] });
      assert.equal(repoCalled, false);
    } finally { restore(r); }
  });

  await t.test('lookup and old-password comparison contracts', async () => {
    const r = [];
    try {
      patch(passwordValidator, 'validatePassword', () => ({ valid: true, errors: [] }), r);
      patch(repository, 'findByIdWithPassword', async (id) => {
        assert.equal(id, 'u1');
        return { _id: 'u1', password: 'hash', failedLoginAttempts: 0, lockedUntil: null };
      }, r);
      patch(bcrypt, 'compare', async (plain, hash) => {
        assert.deepEqual([plain, hash], ['old', 'hash']);
        return false;
      }, r);
      patch(repository, 'recordFailedPasswordAttempt', async () => ({ failedLoginAttempts: 1 }), r);
      await appError(() => service.updatePassword({
        userId: 'u1',
        oldPassword: 'old',
        newPassword: 'NewPass1',
      }), 401, {
        success: false,
        message: 'Current password is incorrect. 4 attempt(s) remaining.',
      });
    } finally { restore(r); }
  });

  await t.test('missing user exact 404', async () => {
    const r = [];
    try {
      patch(passwordValidator, 'validatePassword', () => ({ valid: true, errors: [] }), r);
      patch(repository, 'findByIdWithPassword', async () => null, r);
      await appError(() => service.updatePassword({
        userId: 'u1',
        oldPassword: 'old',
        newPassword: 'NewPass1',
      }), 404, { status: false, message: 'User not found' });
    } finally { restore(r); }
  });
});
