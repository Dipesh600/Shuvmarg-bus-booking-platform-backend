'use strict';

process.env.SECRET_KEY ||= 'test-only-secret-32chars-minimum!!';

const test = require('node:test');
const assert = require('node:assert/strict');
const User = require('../../../models/userModel');
const repository = require('../../../src/modules/bus-owner/auth/login/bus-owner-login.repository');

const patch = (obj, key, fn, restore) => {
  const old = obj[key];
  obj[key] = fn;
  restore.push(() => { obj[key] = old; });
};

const EXPECTED_SELECTION = '+password failedLoginAttempts lockedUntil status roles role '
  + 'forcePasswordChange suspensionReason suspendedAt';

test('bus-owner-login repository unit tests', async (t) => {
  await t.test('findLoginUser uses correct $or query and exact selection', async () => {
    const restore = [];
    const calls = [];
    const fakeSelect = (sel) => { calls.push({ select: sel }); return null; };
    patch(User, 'findOne', (query) => { calls.push({ query }); return { select: fakeSelect }; }, restore);
    try {
      await repository.findLoginUser('n-9814', '9814');
      assert.deepEqual(calls[0].query, {
        $or: [{ phone: 'n-9814' }, { phone: '9814' }],
        deletedAt: null,
      });
      assert.equal(calls[1].select, EXPECTED_SELECTION);
    } finally { restore.reverse().forEach((fn) => fn()); }
  });

  await t.test('incrementFailedLoginAttempts uses $inc with new:true', async () => {
    const restore = [];
    const calls = [];
    patch(User, 'findByIdAndUpdate', (id, update, opts) => {
      calls.push({ id, update, opts }); return Promise.resolve({ failedLoginAttempts: 1 });
    }, restore);
    try {
      await repository.incrementFailedLoginAttempts('uid1');
      assert.equal(calls[0].id, 'uid1');
      assert.deepEqual(calls[0].update, { $inc: { failedLoginAttempts: 1 } });
      assert.deepEqual(calls[0].opts, { new: true });
    } finally { restore.reverse().forEach((fn) => fn()); }
  });

  await t.test('lockAccount uses $set lockedUntil with NO third argument', async () => {
    const restore = [];
    const calls = [];
    patch(User, 'findByIdAndUpdate', (...args) => {
      calls.push(args); return Promise.resolve();
    }, restore);
    const lockDate = new Date(Date.now() + 15 * 60 * 1000);
    try {
      await repository.lockAccount('uid2', lockDate);
      assert.equal(calls[0].length, 2);
      assert.equal(calls[0][0], 'uid2');
      assert.deepEqual(calls[0][1], { $set: { lockedUntil: lockDate } });
    } finally { restore.reverse().forEach((fn) => fn()); }
  });

  await t.test('resetLoginSecurityState uses $set with NO third argument', async () => {
    const restore = [];
    const calls = [];
    patch(User, 'findByIdAndUpdate', (...args) => {
      calls.push(args); return Promise.resolve();
    }, restore);
    const now = new Date();
    try {
      await repository.resetLoginSecurityState('uid3', now);
      assert.equal(calls[0].length, 2);
      assert.equal(calls[0][0], 'uid3');
      assert.deepEqual(calls[0][1], { $set: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: now } });
    } finally { restore.reverse().forEach((fn) => fn()); }
  });
});
