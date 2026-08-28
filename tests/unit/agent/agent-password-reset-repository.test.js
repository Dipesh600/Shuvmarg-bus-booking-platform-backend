'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const User = require('../../../models/userModel');
const repository = require('../../../src/modules/agent/auth/password-reset/agent-password-reset.repository');

const patch = (obj, key, fn) => {
  const old = obj[key];
  obj[key] = fn;
  return () => { obj[key] = old; };
};

test('agent password reset repository preserves query contracts', async (t) => {
  await t.test('findUserByPhone uses exact phone filter', async () => {
    let filter;
    const restore = patch(User, 'findOne', (f) => { filter = f; return 'user'; });
    try {
      const result = await repository.findUserByPhone('9818500001');
      assert.equal(result, 'user');
      assert.deepEqual(filter, { phone: '9818500001' });
    } finally { restore(); }
  });

  await t.test('completion is one guarded credential and activation update', async () => {
    let args;
    const restore = patch(User, 'findOneAndUpdate', (...a) => { args = a; return 'ok'; });
    try {
      assert.equal(await repository.completePasswordReset({
        userId: 'u1', expectedStatus: 'invited', hashedPassword: 'hash',
      }), 'ok');
      assert.deepEqual(args, [
        {
          _id: 'u1', status: 'invited', deletedAt: null,
          $or: [{ roles: 'agent' }, { role: 'agent', roles: { $size: 0 } }],
        },
        {
          $set: {
            password: 'hash', status: 'active', isVerified: true,
            phoneVerified: true, failedLoginAttempts: 0, lockedUntil: null,
            forcePasswordChange: false,
            temporaryCredentialIssuedAt: null,
            temporaryCredentialExpiresAt: null,
            temporaryCredentialIssuedBy: null,
          },
          $inc: { tokenVersion: 1, temporaryCredentialVersion: 1 },
        },
        { new: true, runValidators: true },
      ]);
    } finally { restore(); }
  });
});
