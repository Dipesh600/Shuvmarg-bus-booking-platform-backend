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

test('update-password service preserves complete successful operation order', async () => {
  const r = [];
  const order = [];
  try {
    patch(passwordValidator, 'validatePassword', () => {
      order.push('validate');
      return { valid: true, errors: [] };
    }, r);
    patch(repository, 'findByIdWithPassword', async (id) => {
      order.push(`find:${id}`);
      return { _id: 'u1', password: 'hash', failedLoginAttempts: 2, lockedUntil: 'date' };
    }, r);
    let compares = 0;
    patch(bcrypt, 'compare', async (plain, hash) => {
      compares += 1;
      order.push(compares === 1 ? `old:${plain}:${hash}` : `new:${plain}:${hash}`);
      return compares === 1;
    }, r);
    patch(repository, 'clearFailedPasswordState', async (id) => order.push(`clear:${id}`), r);
    patch(bcrypt, 'hash', async (p, cost) => {
      order.push(`hash:${p}:${cost}`);
      return 'new-hash';
    }, r);
    patch(repository, 'updatePasswordHash', async (id, h) => order.push(`update:${id}:${h}`), r);
    patch(tokenService, 'revokeAllUserTokens', async (id) => order.push(`revoke:${id}`), r);
    await service.updatePassword({
      userId: 'u1',
      oldPassword: 'OldPass1',
      newPassword: 'NewPass1',
    });
    assert.deepEqual(order, [
      'validate',
      'find:u1',
      'old:OldPass1:hash',
      'clear:u1',
      'new:NewPass1:hash',
      'hash:NewPass1:12',
      'update:u1:new-hash',
      'revoke:u1',
    ]);
  } finally { restore(r); }
});
