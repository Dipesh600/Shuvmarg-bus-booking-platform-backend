'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createTestSecret,
  createTestPassword,
} = require('../../helpers/security-test-values');
const passwordValidator = require('../../../utils/passwordValidator');

test('Security Test Values Helper Unit Tests', async (t) => {
  await t.test('createTestSecret is deterministic for the same label', () => {
    const s1 = createTestSecret('test-secret');
    const s2 = createTestSecret('test-secret');
    assert.equal(s1, s2);
  });

  await t.test('createTestSecret returns different values for different labels', () => {
    const s1 = createTestSecret('label-a');
    const s2 = createTestSecret('label-b');
    assert.notEqual(s1, s2);
  });

  await t.test('createTestSecret returns 64 hexadecimal characters', () => {
    const secret = createTestSecret('hex-check');
    assert.equal(typeof secret, 'string');
    assert.equal(secret.length, 64);
    assert.match(secret, /^[0-9a-f]{64}$/);
  });

  await t.test('createTestPassword is deterministic for the same label', () => {
    const p1 = createTestPassword('test-pass');
    const p2 = createTestPassword('test-pass');
    assert.equal(p1, p2);
  });

  await t.test('createTestPassword returns different values for different labels', () => {
    const p1 = createTestPassword('pass-a');
    const p2 = createTestPassword('pass-b');
    assert.notEqual(p1, p2);
  });

  await t.test('createTestPassword generates valid passwords meeting passwordValidator policy', () => {
    const password = createTestPassword('validator-check');
    const validation = passwordValidator.validatePassword(password);
    assert.equal(validation.valid, true);
    assert.deepEqual(validation.errors, []);
  });

  await t.test('password fixtures used by callers are valid and unique', () => {
    const labels = [
      'passenger-model-password-present',
      'user-model-privileged-valid',
      'bus-owner-upgrade-edge-race',
      'bus-owner-passwordless-upgrade',
    ];

    const passwords = labels.map(createTestPassword);

    assert.equal(new Set(passwords).size, labels.length);

    for (const password of passwords) {
      assert.equal(password.length, 20);

      const validation = passwordValidator.validatePassword(password);

      assert.equal(validation.valid, true);
      assert.deepEqual(validation.errors, []);
    }
  });
});
