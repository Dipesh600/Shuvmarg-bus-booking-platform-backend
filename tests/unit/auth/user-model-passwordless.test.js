'use strict';

/**
 * tests/unit/auth/user-model-passwordless.test.js
 *
 * Validates that passenger-role documents do NOT require a password.
 * No database connection required — uses user.validate() directly.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

process.env.NODE_ENV = 'test';

const User = require('../../../models/userModel');

const makeUser = (fields) => new User({ phone: '9800000001', ...fields });

const expectValid = async (user) => {
  await assert.doesNotReject(
    () => user.validate(),
    'Expected document to be valid but got a validation error',
  );
};

test('User model — passenger roles require no password', async (t) => {

  await t.test('passenger in roles[] — no password required', async () => {
    const user = makeUser({ roles: ['passenger'], role: 'passenger' });
    await expectValid(user);
  });

  await t.test('passenger via role field only (empty roles[]) — no password error', async () => {
    // roles[] minimum validator fires (unrelated), but password path must be clean.
    const user = makeUser({ role: 'passenger', roles: [] });
    try {
      await user.validate();
    } catch (err) {
      assert.ok(!(err.errors && err.errors.password),
        `password error must not be present; got: ${Object.keys(err.errors || {})}`);
    }
  });

  await t.test('no roles at all — no password error', async () => {
    const user = new User({ phone: '9800000002' });
    try {
      await user.validate();
    } catch (err) {
      assert.ok(!(err.errors && err.errors.password),
        `password error must not be present; got: ${Object.keys(err.errors || {})}`);
    }
  });

  await t.test('passenger with password also valid — password present, no constraint fired', async () => {
    const user = makeUser({ roles: ['passenger'], role: 'passenger', password: 'AnyP@ss123' });
    await expectValid(user);
  });
});
