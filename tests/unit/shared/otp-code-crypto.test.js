'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

process.env.SECRET_KEY = 'test-only-otp-crypto-secret';

const EXPECTED_SECRET_ERROR =
  '[otpHelper] SECRET_KEY environment variable is required for OTP HMAC but is not set. ' +
  'Set it in your .env file and restart the server.';

const {
  hashOTP,
  generateOtpCode,
  safeCompare,
} = require('../../../src/shared/auth/otp-code.crypto.js');

test('OTP Code Crypto Unit Tests', async (t) => {
  await t.test('hashOTP matches native createHmac sha256 output', () => {
    const otp = '123456';
    const expected = crypto
      .createHmac('sha256', process.env.SECRET_KEY)
      .update(String(otp))
      .digest('hex');
    assert.equal(hashOTP(otp), expected);
  });

  await t.test('hashOTP produces deterministic and unique outputs', () => {
    assert.equal(hashOTP('654321'), hashOTP('654321'));
    assert.notEqual(hashOTP('111111'), hashOTP('222222'));
  });

  await t.test('generateOtpCode returns a valid 6-digit numeric string in range', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateOtpCode();
      assert.equal(typeof code, 'string');
      assert.equal(code.length, 6);
      assert.match(code, /^\d{6}$/);
      const num = Number(code);
      assert.ok(Number.isInteger(num));
      assert.ok(num >= 100000 && num < 999999);
    }
  });

  await t.test('safeCompare string equality checks', () => {
    assert.equal(safeCompare('123456', '123456'), true);
    assert.equal(safeCompare('123456', '654321'), false);
    assert.equal(safeCompare('123456', '12345'), false);
  });

  await t.test('safeCompare returns false for non-string values', () => {
    assert.equal(safeCompare(123456, '123456'), false);
    assert.equal(safeCompare('123456', 123456), false);
    assert.equal(safeCompare(null, '123456'), false);
    assert.equal(safeCompare('123456', undefined), false);
    assert.equal(safeCompare({}, {}), false);
  });

  await t.test('Loading module without SECRET_KEY fails with exact error message', () => {
    const child = spawnSync(
      process.execPath,
      [
        '-e',
        `
          delete process.env.SECRET_KEY;

          try {
            require("./src/shared/auth/otp-code.crypto.js");
          } catch (error) {
            process.stderr.write(error.message);
            process.exit(1);
          }
        `,
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      }
    );

    assert.equal(child.status, 1);
    assert.equal(child.stderr, EXPECTED_SECRET_ERROR);
  });
});
