'use strict';

/**
 * tests/unit/auth/registration-verification-envelope.test.js
 *
 * Unit tests verifying that verifyOTP returns verificationToken flat on the response body root.
 * Follows established passenger-otp-controller test pattern with safe restore array patching.
 */

const { createTestSecret } = require('../../helpers/security-test-values');

process.env.VERIFICATION_TOKEN_SECRET ||= createTestSecret('verification-token');
process.env.SECRET_KEY ||= createTestSecret('application-hmac');

const test = require('node:test');
const assert = require('node:assert/strict');

const otpHelper = require('../../../utils/otpHelper');
const phoneGuard = require('../../../utils/phoneGuard');

const agentOtpService = require('../../../src/modules/agent/auth/registration/agent-registration-otp.service');
const busOwnerOtpService = require('../../../src/modules/bus-owner/auth/registration/bus-owner-registration-otp.service');

const patch = (obj, key, fn, restore) => {
  const old = obj[key];
  obj[key] = fn;
  restore.push(() => { obj[key] = old; });
};

const PHONE = '+9779800001234';

test('verifyOTP response envelope contract', { concurrency: false }, async (t) => {
  await t.test('agent verifyOTP returns verificationToken flat on responseBody root', async () => {
    const restore = [];
    patch(otpHelper, 'verifyOTPCode', async () => ({ valid: true }), restore);
    patch(phoneGuard, 'checkPhoneForRole', async () => ({ exists: false, hasRole: false, user: null }), restore);

    try {
      const result = await agentOtpService.verifyOTP({ phone: PHONE, otp: '123456' });
      assert.equal(result.statusCode, 200);

      const body = result.responseBody;
      assert.equal(body.success, true);
      assert.equal(typeof body.verificationToken, 'string');
      assert.ok(body.verificationToken.length > 0);
      assert.equal(body.data?.verificationToken, undefined);
    } finally {
      restore.reverse().forEach((fn) => fn());
    }
  });

  await t.test('bus-owner verifyOTP returns verificationToken flat on responseBody root', async () => {
    const restore = [];
    patch(otpHelper, 'verifyOTPCode', async () => ({ valid: true }), restore);
    patch(phoneGuard, 'checkPhoneForRole', async () => ({ exists: false, hasRole: false, user: null }), restore);

    try {
      const result = await busOwnerOtpService.verifyOTP({ phone: PHONE, otp: '123456' });
      assert.equal(result.statusCode, 200);

      const body = result.responseBody;
      assert.equal(body.success, true);
      assert.equal(typeof body.verificationToken, 'string');
      assert.ok(body.verificationToken.length > 0);
      assert.equal(body.data?.verificationToken, undefined);
    } finally {
      restore.reverse().forEach((fn) => fn());
    }
  });
});
