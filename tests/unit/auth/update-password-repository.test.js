'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const User = require('../../../models/userModel');
const repository = require('../../../src/modules/auth/update-password/update-password.repository');

test('update-password repository preserves query contracts', async (t) => {
  await t.test('recordFailedPasswordAttempt uses exact aggregation pipeline shape', async () => {
    const orig = User.findByIdAndUpdate;
    const lockDate = new Date('2030-01-01T00:00:00.000Z');
    try {
      User.findByIdAndUpdate = (id, pipeline, options) => {
        assert.equal(id, 'u1');
        assert.deepEqual(options, { new: true });
        assert.deepEqual(pipeline, [{
          $set: {
            failedLoginAttempts: { $add: ['$failedLoginAttempts', 1] },
            lockedUntil: {
              $cond: {
                if: { $gte: [{ $add: ['$failedLoginAttempts', 1] }, 5] },
                then: lockDate,
                else: '$lockedUntil',
              },
            },
            tokenVersion: {
              $cond: {
                if: { $gte: [{ $add: ['$failedLoginAttempts', 1] }, 5] },
                then: { $add: ['$tokenVersion', 1] },
                else: '$tokenVersion',
              },
            },
          },
        }]);
        return Promise.resolve({ failedLoginAttempts: 5 });
      };
      const result = await repository.recordFailedPasswordAttempt('u1', lockDate);
      assert.deepEqual(result, { failedLoginAttempts: 5 });
    } finally { User.findByIdAndUpdate = orig; }
  });

  await t.test('other repository methods preserve exact query shape', async () => {
    const origFind = User.findById;
    const origUpdate = User.findByIdAndUpdate;
    try {
      User.findById = (id) => {
        assert.equal(id, 'u2');
        return { select: (s) => ({ id, s }) };
      };
      assert.deepEqual(repository.findByIdWithPassword('u2'), { id: 'u2', s: '+password' });
      User.findByIdAndUpdate = (id, update, options) => {
        assert.equal(options, undefined);
        return { id, update };
      };
      assert.deepEqual(repository.clearFailedPasswordState('u3'), {
        id: 'u3',
        update: { $set: { failedLoginAttempts: 0, lockedUntil: null } },
      });
      assert.deepEqual(repository.updatePasswordHash('u4', 'hash'), {
        id: 'u4',
        update: { password: 'hash' },
      });
    } finally {
      User.findById = origFind;
      User.findByIdAndUpdate = origUpdate;
    }
  });
});
