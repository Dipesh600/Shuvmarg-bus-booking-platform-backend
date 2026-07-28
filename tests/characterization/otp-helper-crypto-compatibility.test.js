'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.SECRET_KEY = 'test-only-otp-helper-secret';
process.env.SPARROW_SMS_TOKEN = 'test-stub';

const otpHelper = require('../../utils/otpHelper.js');
const otpCrypto = require('../../src/shared/auth/otp-code.crypto.js');

test('OTP Helper Crypto Compatibility Characterization Test', async (t) => {
  await t.test('Delegated function references match crypto module exports', () => {
    assert.equal(otpHelper.generateOtpCode, otpCrypto.generateOtpCode);
    assert.equal(otpHelper.safeCompare, otpCrypto.safeCompare);
  });

  await t.test('Export surface matches exact expected keys', () => {
    const expectedKeys = [
      'generateOtpCode',
      'safeCompare',
      'createAndSendOTP',
      'verifyOTPCode',
      'OTP_EXPIRY_MINUTES',
      'MAX_OTP_SENDS',
    ];
    assert.deepEqual(Object.keys(otpHelper).sort(), expectedKeys.sort());
  });

  await t.test('hashOTP is not exported by otpHelper', () => {
    assert.equal(Object.hasOwn(otpHelper, 'hashOTP'), false);
    assert.equal(otpHelper.hashOTP, undefined);
  });

  await t.test('Exported constants remain exact', () => {
    assert.equal(otpHelper.OTP_EXPIRY_MINUTES, 5);
    assert.equal(otpHelper.MAX_OTP_SENDS, 3);
  });
});
