'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const User = require('../../../models/userModel');
const repository = require('../../../src/modules/bus-owner/auth/password-reset/bus-owner-password-reset.repository');

const patch = (obj, key, value) => {
  const original = obj[key];
  obj[key] = value;
  return () => { obj[key] = original; };
};

test('bus-owner password-reset repository preserves exact User calls', async () => {
  const calls = [];
  const restores = [
    patch(User, 'findOne', (filter) => { calls.push(['findOne', filter]); return 'user'; }),
    patch(User, 'findByIdAndUpdate', (...args) => { calls.push(['inc', args]); return 'ok'; }),
  ];
  try {
    assert.equal(await repository.findUserByPhone('9811111111'), 'user');
    const user = { save: async () => { calls.push(['save']); return 'saved'; } };
    assert.equal(await repository.saveUser(user), 'saved');
    await repository.incrementTokenVersion('user-id');
    assert.deepEqual(calls, [
      ['findOne', { phone: '9811111111' }],
      ['save'],
      ['inc', ['user-id', { $inc: { tokenVersion: 1 } }]],
    ]);
  } finally { restores.forEach((restore) => restore()); }
});
