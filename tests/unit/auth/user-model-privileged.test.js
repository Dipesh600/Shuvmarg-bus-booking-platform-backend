'use strict';

/**
 * tests/unit/auth/user-model-privileged.test.js
 *
 * Validates that privileged-role documents (agent, busOwner, conductor, driver)
 * require a password, including the Mongoose timing edge case where validators
 * run BEFORE pre-save hooks (so roles[] may still be empty when role:'agent').
 *
 * No database connection required — uses user.validate() directly.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

process.env.NODE_ENV = 'test';

const User = require('../../../models/userModel');

const makeUser = (fields) => new User({ phone: '9800000001', ...fields });

const expectPasswordRequired = async (user) => {
  await assert.rejects(
    () => user.validate(),
    (err) => {
      assert.equal(err instanceof mongoose.Error.ValidationError, true);
      assert.ok(err.errors.password, `Expected password validation error, got: ${Object.keys(err.errors)}`);
      return true;
    },
  );
};

test('User model — privileged roles require a password', async (t) => {

  await t.test('agent in roles[] — password required', async () => {
    await expectPasswordRequired(makeUser({ roles: ['agent'], role: 'agent' }));
  });

  await t.test('busOwner in roles[] — password required', async () => {
    await expectPasswordRequired(makeUser({ roles: ['busOwner'], role: 'busOwner' }));
  });

  await t.test('conductor in roles[] — password required', async () => {
    await expectPasswordRequired(makeUser({ roles: ['conductor'], role: 'conductor' }));
  });

  await t.test('driver in roles[] — password required', async () => {
    await expectPasswordRequired(makeUser({ roles: ['driver'], role: 'driver' }));
  });

  // Critical: validators run BEFORE pre-save hooks — cannot rely on roles[] being populated.
  await t.test('role:agent with empty roles[] — password required (pre-save timing)', async () => {
    await expectPasswordRequired(makeUser({ role: 'agent', roles: [] }));
  });

  await t.test('role:busOwner with empty roles[] — password required (pre-save timing)', async () => {
    await expectPasswordRequired(makeUser({ role: 'busOwner', roles: [] }));
  });

  await t.test('passenger + agent roles — password required', async () => {
    await expectPasswordRequired(makeUser({ roles: ['passenger', 'agent'], role: 'passenger' }));
  });

  await t.test('agent with valid password — valid (password satisfies constraint)', async () => {
    const user = makeUser({ roles: ['agent'], role: 'agent', password: 'ValidP@ss1' });
    try {
      await user.validate();
    } catch (err) {
      assert.ok(!err.errors.password, 'password error should not be present');
    }
  });
});
