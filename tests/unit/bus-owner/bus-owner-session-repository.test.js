'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const User = require('../../../models/userModel');
const repository = require('../../../src/modules/bus-owner/auth/session/bus-owner-session.repository');

test('bus-owner session repository preserves tokenVersion increment query', async () => {
  const orig = User.findByIdAndUpdate;
  try {
    User.findByIdAndUpdate = (id, update, options) => {
      assert.equal(id, 'user-1');
      assert.deepEqual(update, {
        $inc: {
          tokenVersion: 1,
        },
      });
      assert.equal(options, undefined);
      return Promise.resolve({ ok: true });
    };
    assert.deepEqual(await repository.incrementTokenVersion('user-1'), { ok: true });
  } finally {
    User.findByIdAndUpdate = orig;
  }
});
