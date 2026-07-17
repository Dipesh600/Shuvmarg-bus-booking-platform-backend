'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const policy = require('../../../src/modules/auth/profile/profile.policy');

const errBody = (fn) => {
  try { fn(); } catch (error) { return error.responseBody; }
  throw new Error('expected throw');
};

test('profile policy preserves normalization and validation contracts', async (t) => {
  await t.test('normalize exact legacy behavior', () => {
    const cases = [
      [undefined, null], [null, null], ['', null], ['   ', null],
      ['null', null], ['NULL', null], ['undefined', null],
      ['UNDEFINED', null], ['  Dipesh  ', 'Dipesh'], [0, 0],
      [false, false], [{ a: 1 }, { a: 1 }],
    ];
    for (const [input, expected] of cases) {
      assert.deepEqual(policy.normalize(input), expected);
    }
  });

  await t.test('required-field and text validations preserve exact bodies', () => {
    assert.deepEqual(errBody(() => policy.requireUser()), {
      status: false, message: 'Unauthorized: User not authenticated',
    });
    assert.deepEqual(errBody(() => policy.requireProfilePicture()), {
      status: false, message: 'Profile picture is required',
    });
    assert.deepEqual(errBody(() => policy.requireUpdateField(null, null, null, null)), {
      status: false,
      message: 'At least one field (name, address, gender, or profilePic) is required to update',
    });
    assert.equal(errBody(() => policy.validateProfileFields('ab')).message,
      'Name must be at least 3 characters long');
    assert.equal(errBody(() => policy.validateProfileFields(null, 'road')).message,
      'Address must be at least 5 characters long');
    assert.equal(errBody(() => policy.validateProfileFields(null, null, 'other')).message,
      "Gender must be either 'male' or 'female'");
    assert.throws(() => policy.validateProfileFields(null, null, 1), /toLowerCase/);
  });

  await t.test('MIME distinctions and strict updateProfile size limit', () => {
    assert.doesNotThrow(() => policy.validateStandalonePicture({ mimetype: 'image/gif' }));
    assert.equal(errBody(() => policy.validateStandalonePicture({ mimetype: 'image/webp' })).message,
      'Invalid file type. Only JPEG, PNG, and GIF are allowed');
    assert.doesNotThrow(() => policy.validateUpdatePicture({
      mimetype: 'image/webp', size: 5 * 1024 * 1024,
    }));
    assert.equal(errBody(() => policy.validateUpdatePicture({
      mimetype: 'image/png', size: 5 * 1024 * 1024 + 1,
    })).message, 'File size too large. Maximum 5MB allowed');
    assert.equal(errBody(() => policy.validateUpdatePicture({
      mimetype: 'text/plain', size: 1,
    })).message, 'Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed');
  });
});
