'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const repository = require('../../../src/modules/auth/profile/profile.repository');
const User = require('../../../models/userModel');

test('profile repository preserves exact query contracts', async (t) => {
  await t.test('find and detail projection contracts', () => {
    const old = User.findById;
    const calls = [];
    User.findById = (id) => {
      calls.push(id);
      return { select: (projection) => ({ id, projection }) };
    };
    try {
      const found = repository.findById('u1');
      assert.equal(typeof found.select, 'function');
      const detail = repository.findByIdWithDetailProjection('u2');
      assert.deepEqual(calls, ['u1', 'u2']);
      assert.equal(detail.projection, repository.DETAIL_SELECT);
    } finally { User.findById = old; }
  });

  await t.test('updateProfile uses exact options and projection string', () => {
    const old = User.findByIdAndUpdate;
    let got;
    User.findByIdAndUpdate = (id, update, options) => { got = { id, update, options }; };
    try {
      repository.updateProfile('u3', { name: 'A' });
      assert.deepEqual(got, {
        id: 'u3',
        update: { name: 'A' },
        options: { new: true, runValidators: true, select: repository.PROFILE_SELECT },
      });
    } finally { User.findByIdAndUpdate = old; }
  });

  await t.test('saveProfilePicture assigns URL and validates before save', async () => {
    const calls = [];
    const user = { save: async (opts) => { calls.push(opts); } };
    await repository.saveProfilePicture(user, 'https://cdn/new.png');
    assert.equal(user.profilePicture, 'https://cdn/new.png');
    assert.deepEqual(calls, [{ validateBeforeSave: true }]);
  });
});
