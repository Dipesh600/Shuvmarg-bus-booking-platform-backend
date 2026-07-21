'use strict';

/**
 * tests/unit/auth/passenger-otp-verify-core.test.js
 *
 * Verification service: input validation and OTP isolation (T1–T8).
 */

process.env.SECRET_KEY ||= 'test-only-secret-32chars-minimum!!';

const test = require('node:test');
const assert = require('node:assert/strict');
const otpHelper = require('../../../utils/otpHelper');
const tokenService = require('../../../utils/tokenService');
const repository = require('../../../src/modules/auth/passenger-otp-auth/passenger-otp-auth.repository');
const passengerAccount = require('../../../src/modules/auth/passenger-account');
const { verifyPassengerOTPAndCreateSession } = require('../../../src/modules/auth/passenger-otp-auth/verify-passenger-otp.service');

const patch = (obj, key, fn, restore) => {
  const old = obj[key]; obj[key] = fn; restore.push(() => { obj[key] = old; });
};

const rejectsCode = async (fn, statusCode, errorCode) =>
  assert.rejects(fn, (err) => {
    assert.equal(err.statusCode, statusCode, `expected statusCode ${statusCode}`);
    if (errorCode) assert.equal(err.responseBody?.errorCode, errorCode, `expected errorCode ${errorCode}`);
    return true;
  });

const baseState = (o = {}) => ({
  user: { _id: 'uid1', role: 'passenger', roles: ['passenger'], status: 'active', deletedAt: null, phoneVerified: true, name: null, email: null, phone: '9800000010', profilePicture: null, forcePasswordChange: false, tokenVersion: 0, ...o },
  hasUsablePassword: false,
});

const stubAll = (restore, state = baseState()) => {
  patch(otpHelper, 'verifyOTPCode', async () => ({ valid: true, error: null }), restore);
  patch(passengerAccount, 'resolvePassengerAccountAfterPhoneVerification', async () => ({ _id: 'uid1' }), restore);
  patch(repository, 'loadPassengerSessionState', async () => state, restore);
  patch(repository, 'recordPassengerLogin', async () => {}, restore);
  patch(tokenService, 'generateTokenPair', async () => ({ accessToken: 'at', refreshToken: 'rt' }), restore);
};

const verify = (phone = '9800000010', otp = '123456') =>
  verifyPassengerOTPAndCreateSession({ rawPhone: phone, otp, deviceInfo: 'UA', ipAddress: '1.2.3.4', now: new Date() });

test('passenger OTP verify service — validation and OTP isolation', async (t) => {
  await t.test('T1: missing phone throws 400', async () => {
    await rejectsCode(() => verifyPassengerOTPAndCreateSession({ rawPhone: '', otp: '123456', now: new Date() }), 400);
  });

  await t.test('T2: missing OTP throws 400', async () => {
    await rejectsCode(() => verifyPassengerOTPAndCreateSession({ rawPhone: '9800000010', otp: '', now: new Date() }), 400);
  });

  await t.test('T3: non-six-digit OTP throws 400 INVALID_OTP_LENGTH', async () => {
    await rejectsCode(() => verifyPassengerOTPAndCreateSession({ rawPhone: '9800000010', otp: '1234', now: new Date() }), 400, 'INVALID_OTP_LENGTH');
  });

  await t.test('T4: phone normalized before OTP verification', async () => {
    const restore = []; let verifiedPhone;
    patch(otpHelper, 'verifyOTPCode', async (ph) => { verifiedPhone = ph; return { valid: false, error: 'bad' }; }, restore);
    try {
      await rejectsCode(() => verifyPassengerOTPAndCreateSession({ rawPhone: '+9779800000010', otp: '123456', now: new Date() }), 400);
      assert.equal(verifiedPhone, '9800000010');
    } finally { restore.reverse().forEach((fn) => fn()); }
  });

  await t.test('T5: verifyOTPCode called with PASSENGER_AUTH purpose', async () => {
    const restore = []; let capturedPurpose;
    patch(otpHelper, 'verifyOTPCode', async (_ph, _otp, purpose) => { capturedPurpose = purpose; return { valid: false, error: 'bad' }; }, restore);
    try {
      await rejectsCode(() => verify(), 400);
      assert.equal(capturedPurpose, 'PASSENGER_AUTH');
    } finally { restore.reverse().forEach((fn) => fn()); }
  });

  await t.test('T6: invalid OTP does not call resolver', async () => {
    const restore = []; let resolverCalled = false;
    patch(otpHelper, 'verifyOTPCode', async () => ({ valid: false, error: 'Incorrect OTP.' }), restore);
    patch(passengerAccount, 'resolvePassengerAccountAfterPhoneVerification', async () => { resolverCalled = true; return { _id: 'x' }; }, restore);
    try {
      await rejectsCode(() => verify(), 400, 'INVALID_OTP');
      assert.equal(resolverCalled, false);
    } finally { restore.reverse().forEach((fn) => fn()); }
  });

  await t.test('T7: valid OTP calls resolver once with normalized phone', async () => {
    const restore = []; const calls = [];
    patch(otpHelper, 'verifyOTPCode', async () => ({ valid: true, error: null }), restore);
    patch(passengerAccount, 'resolvePassengerAccountAfterPhoneVerification', async (args) => { calls.push(args.phone); return { _id: 'uid1' }; }, restore);
    patch(repository, 'loadPassengerSessionState', async () => baseState(), restore);
    patch(repository, 'recordPassengerLogin', async () => {}, restore);
    patch(tokenService, 'generateTokenPair', async () => ({ accessToken: 'at', refreshToken: 'rt' }), restore);
    try {
      await verify();
      assert.equal(calls.length, 1);
      assert.equal(calls[0], '9800000010');
    } finally { restore.reverse().forEach((fn) => fn()); }
  });

  await t.test('T8: new phone session: passwordSetupRequired true, statusCode 200', async () => {
    const restore = [];
    stubAll(restore, baseState());
    try {
      const r = await verify();
      assert.equal(r.statusCode, 200);
      assert.equal(r.responseBody.passwordSetupRequired, true);
      assert.equal(r.responseBody.activeRole, 'passenger');
    } finally { restore.reverse().forEach((fn) => fn()); }
  });
});
