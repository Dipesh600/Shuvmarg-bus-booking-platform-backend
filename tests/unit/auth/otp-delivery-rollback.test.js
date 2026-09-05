'use strict';

process.env.SECRET_KEY ||= 'test-only-secret-32chars-minimum!!';

const test = require('node:test');
const assert = require('node:assert/strict');
const OTP = require('../../../models/otpModel');
const otpHelper = require('../../../utils/otpHelper');

const patch = (object, key, replacement, restores) => {
  const original = object[key];
  object[key] = replacement;
  restores.push(() => { object[key] = original; });
};

test('failed first SMS delivery removes its OTP reservation and cooldown state', async () => {
  const restores = [];
  const writes = [];
  const deletes = [];
  patch(OTP, 'findOne', async () => null, restores);
  patch(OTP, 'findOneAndUpdate', async (...args) => {
    writes.push(args);
    return { _id: 'reserved-otp' };
  }, restores);
  patch(OTP, 'deleteOne', async (filter) => {
    deletes.push(filter);
    return { deletedCount: 1 };
  }, restores);
  try {
    await assert.rejects(
      otpHelper.createAndSendOTP(
        '9800001001',
        'DRIVER_PASSWORD_RESET',
        null,
        async () => { throw new Error('Sparrow SMS Gateway Error: rejected'); },
      ),
      /Sparrow SMS Gateway Error/,
    );
    assert.equal(writes.length, 1);
    assert.equal(deletes.length, 1);
    assert.equal(deletes[0].phone, '9800001001');
    assert.equal(deletes[0].purpose, 'DRIVER_PASSWORD_RESET');
    assert.equal(deletes[0].otp, writes[0][1].otp);
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});
