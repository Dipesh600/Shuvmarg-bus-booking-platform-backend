'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const User = require('../../../models/userModel');
const DriverProfile = require('../../../models/driverProfileModel');
const repository = require('../../../src/modules/driver/auth/password-reset/driver-password-reset.repository');

const patch = (object, key, replacement, restores) => {
  const original = object[key];
  object[key] = replacement;
  restores.push(() => { object[key] = original; });
};

test('driver recovery lookup requires an ACTIVE non-removed linked profile', async () => {
  const restores = [];
  const user = { _id: 'driver-user', phone: '9800001001' };
  const calls = [];
  patch(User, 'findOne', async (query) => {
    calls.push(['user', query]);
    return user;
  }, restores);
  patch(DriverProfile, 'find', (query) => {
    calls.push(['profile', query]);
    return {
      select(fields) {
        calls.push(['select', fields]);
        return this;
      },
      async lean() {
        return [{ accessStatus: 'ACTIVE', removedAt: null }];
      },
    };
  }, restores);
  try {
    const target = await repository.findRecoveryTargetByPhone(user.phone);
    assert.deepEqual(target, {
      user,
      hasAnyProfile: true,
      hasActiveProfile: true,
      hasInvitedProfile: false,
    });
    assert.deepEqual(calls, [
      ['user', { phone: user.phone }],
      ['profile', { userId: user._id }],
      ['select', 'accessStatus removedAt'],
    ]);
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test('driver password update is guarded by active user and driver role', async () => {
  const restores = [];
  let captured;
  patch(User, 'findOneAndUpdate', async (...args) => {
    captured = args;
    return { _id: 'driver-user' };
  }, restores);
  try {
    await repository.completePasswordReset({
      userId: 'driver-user',
      hashedPassword: 'new-hash',
    });
    const [filter, update, options] = captured;
    assert.equal(filter._id, 'driver-user');
    assert.equal(filter.status, 'active');
    assert.equal(filter.deletedAt, null);
    assert.deepEqual(filter.$or, [
      { roles: 'driver' },
      { role: 'driver', roles: { $exists: false } },
    ]);
    assert.equal(update.$set.password, 'new-hash');
    assert.equal(update.$set.forcePasswordChange, false);
    assert.equal(update.$inc.tokenVersion, 1);
    assert.equal(update.$inc.temporaryCredentialVersion, 1);
    assert.deepEqual(options, { new: true, runValidators: true });
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});
