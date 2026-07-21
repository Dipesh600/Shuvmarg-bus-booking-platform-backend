'use strict';

/**
 * tests/unit/auth/passenger-otp-verify-identity.test.js
 *
 * Verification service: identity resolution cases and legacy role repair (T9–T12).
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
  const old = obj[key];
  obj[key] = fn;
  restore.push(() => { obj[key] = old; });
};

const baseUser = (overrides = {}) => ({
  _id: 'uid1', role: 'passenger', roles: ['passenger'], status: 'active',
  deletedAt: null, phoneVerified: true, name: null, email: null,
  phone: '9800000010', profilePicture: null, forcePasswordChange: false, tokenVersion: 0,
  ...overrides,
});

const baseState = (user = baseUser(), hasUsablePassword = false) => ({ user, hasUsablePassword });

const stubBase = (restore, userId, state) => {
  patch(otpHelper, 'verifyOTPCode', async () => ({ valid: true, error: null }), restore);
  patch(passengerAccount, 'resolvePassengerAccountAfterPhoneVerification', async () => ({ _id: userId }), restore);
  patch(repository, 'loadPassengerSessionState', async () => state, restore);
  patch(repository, 'recordPassengerLogin', async () => {}, restore);
  patch(tokenService, 'generateTokenPair', async () => ({ accessToken: 'at', refreshToken: 'rt' }), restore);
};

const verify = (phone = '9800000010', otp = '123456') =>
  verifyPassengerOTPAndCreateSession({ rawPhone: phone, otp, deviceInfo: 'UA', ipAddress: '1.2.3.4', now: new Date() });

test('passenger OTP verify service — identity cases and role repair', async (t) => {
  await t.test('T9: existing passenger — passwordSetupRequired false when password set', async () => {
    const restore = [];
    stubBase(restore, 'uid1', baseState(baseUser(), true));
    try {
      const r = await verify();
      assert.equal(r.responseBody.passwordSetupRequired, false);
    } finally { restore.reverse().forEach((fn) => fn()); }
  });

  await t.test('T10: agent who has passenger role receives passenger session', async () => {
    const restore = [];
    const u = baseUser({ _id: 'uid2', role: 'agent', roles: ['agent', 'passenger'] });
    stubBase(restore, 'uid2', baseState(u));
    try {
      const r = await verify();
      assert.equal(r.statusCode, 200);
      assert.equal(r.responseBody.activeRole, 'passenger');
    } finally { restore.reverse().forEach((fn) => fn()); }
  });

  await t.test('T11: legacy account (roles:[]) triggers materializeLegacyPassengerRole', async () => {
    const restore = [];
    const legacy = { _id: 'uid3', role: 'passenger', roles: [], status: 'active', deletedAt: null, phoneVerified: true, forcePasswordChange: false, tokenVersion: 0 };
    let repaired = false;
    let loadCount = 0;
    patch(otpHelper, 'verifyOTPCode', async () => ({ valid: true, error: null }), restore);
    patch(passengerAccount, 'resolvePassengerAccountAfterPhoneVerification', async () => ({ _id: 'uid3' }), restore);
    patch(repository, 'loadPassengerSessionState', async () => {
      loadCount++;
      return { user: { ...legacy, roles: loadCount > 1 ? ['passenger'] : [] }, hasUsablePassword: false };
    }, restore);
    patch(repository, 'materializeLegacyPassengerRole', async () => { repaired = true; }, restore);
    patch(repository, 'recordPassengerLogin', async () => {}, restore);
    patch(tokenService, 'generateTokenPair', async () => ({ accessToken: 'at', refreshToken: 'rt' }), restore);
    try {
      const r = await verify();
      assert.equal(repaired, true, 'must call materializeLegacyPassengerRole');
      assert.equal(loadCount, 2, 'must reload state after repair');
      assert.deepEqual(r.responseBody.user.roles, ['passenger']);
    } finally { restore.reverse().forEach((fn) => fn()); }
  });

  await t.test('T12: generateTokenPair receives post-repair roles[] state', async () => {
    const restore = [];
    let tokenRoles;
    const u = baseUser({ _id: 'uid4' });
    patch(otpHelper, 'verifyOTPCode', async () => ({ valid: true, error: null }), restore);
    patch(passengerAccount, 'resolvePassengerAccountAfterPhoneVerification', async () => ({ _id: 'uid4' }), restore);
    patch(repository, 'loadPassengerSessionState', async () => baseState(u), restore);
    patch(repository, 'recordPassengerLogin', async () => {}, restore);
    patch(tokenService, 'generateTokenPair', async (userArg) => { tokenRoles = userArg.roles; return { accessToken: 'at', refreshToken: 'rt' }; }, restore);
    try {
      await verify();
      assert.ok(Array.isArray(tokenRoles) && tokenRoles.includes('passenger'));
    } finally { restore.reverse().forEach((fn) => fn()); }
  });
});
