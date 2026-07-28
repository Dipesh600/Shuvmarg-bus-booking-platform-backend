'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const User = require('../../../models/userModel');
const repository = require('../../../src/modules/agent/auth/login/agent-login.repository');

test('agent-login repository preserves exact User query contracts', async (t) => {
  await t.test('lookup uses exact filter and selection', async () => {
    const original = User.findOne;
    let filter;
    let selection;
    User.findOne = (f) => {
      filter = f;
      return { select: (s) => { selection = s; return 'user'; } };
    };
    try {
      const result = repository.findLoginUser('norm', 'raw');
      assert.equal(result, 'user');
      assert.deepEqual(filter, {
        $or: [{ phone: 'norm' }, { phone: 'raw' }],
        deletedAt: null,
      });
      assert.equal(selection, repository.LOGIN_SELECTION);
    } finally {
      User.findOne = original;
    }
  });

  await t.test('failed increment, lock, and reset update shapes are exact', async () => {
    const original = User.findByIdAndUpdate;
    const calls = [];
    User.findByIdAndUpdate = (...args) => { calls.push(args); return 'ok'; };
    try {
      repository.incrementFailedLoginAttempts('u1');
      const lockDate = new Date('2026-01-01T00:00:00Z');
      repository.lockAccount('u2', lockDate);
      const loginDate = new Date('2026-01-02T00:00:00Z');
      repository.resetLoginSecurityState('u3', loginDate);
      assert.deepEqual(calls[0], ['u1', { $inc: { failedLoginAttempts: 1 } }, { new: true }]);
      assert.deepEqual(calls[1], ['u2', { $set: { lockedUntil: lockDate } }]);
      assert.deepEqual(calls[2], ['u3', {
        $set: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: loginDate },
      }]);
    } finally {
      User.findByIdAndUpdate = original;
    }
  });
});
