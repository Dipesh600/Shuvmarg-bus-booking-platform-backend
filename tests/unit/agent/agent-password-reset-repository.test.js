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

  await t.test('saveUser delegates to document save', async () => {
    let called = false;
    const doc = { save: async () => { called = true; return 'saved'; } };
    assert.equal(await repository.saveUser(doc), 'saved');
    assert.equal(called, true);
  });

  await t.test('incrementTokenVersion uses exact update and no options', async () => {
    let args;
    const restore = patch(User, 'findByIdAndUpdate', (...a) => { args = a; return 'ok'; });
    try {
      assert.equal(await repository.incrementTokenVersion('u1'), 'ok');
      assert.deepEqual(args, ['u1', { $inc: { tokenVersion: 1 } }]);
    } finally { restore(); }
  });
});
