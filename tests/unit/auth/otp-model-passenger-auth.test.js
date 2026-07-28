'use strict';

/**
 * tests/unit/auth/otp-model-passenger-auth.test.js
 *
 * Mongoose schema validation tests for PASSENGER_AUTH purpose in OTP model.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const OTP = require('../../../models/otpModel');

test('OTP Model — PASSENGER_AUTH enum validation', async (t) => {
  await t.test('OTP document with purpose PASSENGER_AUTH passes validate()', async () => {
    const otpDoc = new OTP({
      phone: '9800000000',
      otp: 'hashed_otp_value',
      purpose: 'PASSENGER_AUTH',
      otpExpiry: new Date(Date.now() + 300000),
    });

    let validationError = null;
    try {
      await otpDoc.validate();
    } catch (err) {
      validationError = err;
    }

    assert.equal(validationError, null, 'PASSENGER_AUTH purpose must pass document schema validation');
  });

  await t.test('OTP document with invalid purpose fails validate()', async () => {
    const otpDoc = new OTP({
      phone: '9800000000',
      otp: 'hashed_otp_value',
      purpose: 'INVALID_PURPOSE_ENUM',
      otpExpiry: new Date(Date.now() + 300000),
    });

    await assert.rejects(
      () => otpDoc.validate(),
      (err) => {
        assert.ok(err.errors?.purpose, 'Schema validation error on purpose field expected');
        return true;
      }
    );
  });
});
