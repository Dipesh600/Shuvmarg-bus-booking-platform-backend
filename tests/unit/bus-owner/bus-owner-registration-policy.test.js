'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const policy = require('../../../src/modules/bus-owner/auth/registration/bus-owner-registration.policy');

test('bus-owner registration policy is deterministic and exact', async (t) => {
  await t.test('phone, OTP, missing-field and length decisions', () => {
    assert.equal(policy.BUS_OWNER_PURPOSE, 'BUSOWNER_REGISTRATION');
    assert.equal(policy.isValidNepalMobile('9812345678'), true);
    assert.equal(policy.isValidNepalMobile('9612345678'), false);
    assert.equal(policy.cleanOtp('12-34 ab56'), '123456');
    assert.equal(policy.isSixDigitOtp('123456'), true);
    assert.equal(policy.isSixDigitOtp('12345'), false);
    assert.equal(policy.missingRegistrationField({}), 'Phone');
    assert.equal(policy.missingRegistrationField({ phone: 'p' }), 'Name');
    assert.equal(policy.missingRegistrationField({ phone: 'p', name: 'n' }), 'Company name');
    assert.equal(policy.hasShortName(' ab '), true);
    assert.equal(policy.hasShortCompanyName(' abc '), false);
  });

  await t.test('OTP recency, email and duplicate-key messages', () => {
    const now = 1_000_000;
    assert.equal(policy.isOtpRecent({ updatedAt: new Date(now - policy.OTP_WINDOW_MS) }, now), true);
    assert.equal(policy.isOtpRecent({ updatedAt: new Date(now - policy.OTP_WINDOW_MS - 1) }, now), false);
    assert.equal(policy.normalizedEmail(' A@EXAMPLE.COM '), 'a@example.com');
    assert.equal(policy.duplicateKeyMessage({ keyPattern: { phone: 1 } }), 'Mobile number is already registered.');
    assert.equal(policy.duplicateKeyMessage({ keyPattern: { email: 1 } }), 'Email is already registered.');
    assert.equal(policy.duplicateKeyMessage({ keyPattern: { x: 1 } }), 'Value is already registered.');
    assert.equal(policy.duplicateKeyMessage({}), 'Value is already registered.');
  });

  await t.test('OTP blocked and response/user-data helpers', () => {
    assert.equal(policy.isOtpBlocked(new Error('OTP_SEND_BLOCKED:8')), true);
    assert.equal(policy.otpBlockedMinutes(new Error('OTP_SEND_BLOCKED:0')), 10);
    assert.equal(policy.successMessage(true), 'Bus operator role added. Submit your KYC documents to activate your account.');
    const userData = policy.newUserData({
      name: ' Name ',
      phone: '9812345678',
      password: 'hash',
      email: ' X@Y.COM ',
      address: ' Address ',
      now: new Date(0),
    });
    assert.deepEqual(userData, {
      name: 'Name',
      phone: '9812345678',
      password: 'hash',
      role: 'busOwner',
      roles: ['busOwner'],
      status: 'active',
      phoneVerified: true,
      isVerified: false,
      roleActivatedAt: { busOwner: new Date(0) },
      email: 'x@y.com',
      address: 'Address',
    });
  });
});
