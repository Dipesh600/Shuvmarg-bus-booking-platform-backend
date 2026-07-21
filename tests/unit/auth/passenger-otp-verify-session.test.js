'use strict';

/**
 * tests/unit/auth/passenger-otp-verify-session.test.js
 *
 * Session security tests: account restrictions, forcePasswordChange, token
 * issuance, response shape, and OTP concurrency coverage reference.
 * Tests 13–24 of the verification service specification.
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

const mkUser = (o = {}) => ({ _id: 'uid1', role: 'passenger', roles: ['passenger'], status: 'active', deletedAt: null, phoneVerified: true, name: 'A', email: null, phone: '9800000010', profilePicture: null, forcePasswordChange: false, tokenVersion: 0, ...o });
const mkState = (userO = {}, pwdO = {}) => ({ user: mkUser(userO), hasUsablePassword: false, ...pwdO });

const stubAll = (restore, state = mkState(), tokenResult = { accessToken: 'at', refreshToken: 'rt' }) => {
  patch(otpHelper, 'verifyOTPCode', async () => ({ valid: true, error: null }), restore);
  patch(passengerAccount, 'resolvePassengerAccountAfterPhoneVerification', async () => ({ _id: state.user._id }), restore);
  patch(repository, 'loadPassengerSessionState', async () => state, restore);
  patch(repository, 'recordPassengerLogin', async () => {}, restore);
  patch(tokenService, 'generateTokenPair', async () => tokenResult, restore);
};

const verify = (extra = {}) =>
  verifyPassengerOTPAndCreateSession({ rawPhone: '9800000010', otp: '123456', deviceInfo: 'UA', ipAddress: '1.2.3.4', now: new Date(), ...extra });

test('passenger OTP verify service — session security tests', async (t) => {
  await t.test('T13: activeRole passed to generateTokenPair is always passenger', async () => {
    const restore = [];
    let capturedMeta;
    stubAll(restore);
    patch(tokenService, 'generateTokenPair', async (_u, meta) => { capturedMeta = meta; return { accessToken: 'at', refreshToken: 'rt' }; }, restore);
    try { await verify(); assert.equal(capturedMeta.activeRole, 'passenger'); }
    finally { restore.reverse().forEach((fn) => fn()); }
  });

  await t.test('T14: forcePasswordChange blocks token issuance with 403', async () => {
    const restore = [];
    stubAll(restore, mkState({ forcePasswordChange: true }));
    try {
      await assert.rejects(() => verify(), (e) => { assert.equal(e.statusCode, 403); assert.equal(e.responseBody?.errorCode, 'FORCE_PASSWORD_CHANGE'); return true; });
    } finally { restore.reverse().forEach((fn) => fn()); }
  });

  await t.test('T15: banned status blocks token issuance with 403', async () => {
    const restore = [];
    stubAll(restore, mkState({ status: 'banned' }));
    try {
      await assert.rejects(() => verify(), (e) => { assert.equal(e.statusCode, 403); assert.equal(e.responseBody?.errorCode, 'ACCOUNT_RESTRICTED'); return true; });
    } finally { restore.reverse().forEach((fn) => fn()); }
  });

  await t.test('T16: soft-deleted account blocks token issuance with 403', async () => {
    const restore = [];
    stubAll(restore, mkState({ deletedAt: new Date() }));
    try {
      await assert.rejects(() => verify(), (e) => { assert.equal(e.statusCode, 403); assert.equal(e.responseBody?.errorCode, 'ACCOUNT_RESTRICTED'); return true; });
    } finally { restore.reverse().forEach((fn) => fn()); }
  });

  await t.test('T17: invited status blocks token issuance', async () => {
    const restore = [];
    stubAll(restore, mkState({ status: 'invited' }));
    try {
      await assert.rejects(() => verify(), (e) => { assert.equal(e.statusCode, 403); return true; });
    } finally { restore.reverse().forEach((fn) => fn()); }
  });

  await t.test('T18: recordPassengerLogin before token generation', async () => {
    const restore = []; const order = [];
    stubAll(restore);
    patch(repository, 'recordPassengerLogin', async () => { order.push('login'); }, restore);
    patch(tokenService, 'generateTokenPair', async () => { order.push('token'); return { accessToken: 'at', refreshToken: 'rt' }; }, restore);
    try { await verify(); assert.deepEqual(order, ['login', 'token']); }
    finally { restore.reverse().forEach((fn) => fn()); }
  });

  await t.test('T19: refreshToken in result but not in responseBody', async () => {
    const restore = [];
    stubAll(restore, mkState(), { accessToken: 'at', refreshToken: 'cookie-token' });
    try {
      const r = await verify();
      assert.equal(r.refreshToken, 'cookie-token');
      assert.equal(r.responseBody.refreshToken, undefined);
    } finally { restore.reverse().forEach((fn) => fn()); }
  });

  await t.test('T20: password and internal fields absent from responseBody.user', async () => {
    const restore = [];
    stubAll(restore);
    try {
      const r = await verify();
      const u = r.responseBody.user;
      assert.equal(u.password, undefined);
      assert.equal(u.tokenVersion, undefined);
      assert.equal(u.deletedAt, undefined);
      assert.equal(u.forcePasswordChange, undefined);
      assert.equal(u.failedLoginAttempts, undefined);
    } finally { restore.reverse().forEach((fn) => fn()); }
  });

  await t.test('T21: passwordSetupRequired at response root, not inside user object', async () => {
    const restore = [];
    stubAll(restore, mkState({}, { hasUsablePassword: false }));
    try {
      const r = await verify();
      assert.equal(r.responseBody.passwordSetupRequired, true);
      assert.equal(r.responseBody.user.passwordSetupRequired, undefined);
    } finally { restore.reverse().forEach((fn) => fn()); }
  });

  await t.test('T22: statusCode is 200 for all success cases', async () => {
    const restore = [];
    stubAll(restore);
    try {
      const r = await verify();
      assert.equal(r.statusCode, 200);
    } finally { restore.reverse().forEach((fn) => fn()); }
  });

  await t.test('T23: token-service failure propagates; no partial response returned', async () => {
    const restore = [];
    patch(otpHelper, 'verifyOTPCode', async () => ({ valid: true, error: null }), restore);
    patch(passengerAccount, 'resolvePassengerAccountAfterPhoneVerification', async () => ({ _id: 'uid1' }), restore);
    patch(repository, 'loadPassengerSessionState', async () => mkState(), restore);
    patch(repository, 'recordPassengerLogin', async () => {}, restore);
    patch(tokenService, 'generateTokenPair', async () => { throw new Error('TOKEN_FAIL'); }, restore);
    try {
      await assert.rejects(() => verify(), { message: 'TOKEN_FAIL' });
    } finally { restore.reverse().forEach((fn) => fn()); }
  });

  // T24: OTP atomic one-time consumption is tested via DB-backed characterization test
  // (tests/characterization/passenger-otp-auth.test.js parallel-OTP test).
  await t.test('T24: OTP atomicity verified in characterization suite', () => {
    assert.ok(true);
  });
});
