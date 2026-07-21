'use strict';

/**
 * tests/unit/bus-owner/bus-owner-upgrade-edge.test.js
 *
 * D5–D8: Edge cases for the passwordless-to-busOwner upgrade path.
 *   D5 — does not inspect user.password from checkPhoneForRole (select:false pitfall)
 *   D6 — concurrent upgrade race: null return does not overwrite password
 *   D7 — invalid password for passwordless upgrade → 400
 *   D8 — successful upgrade response shape (isUpgrade:true, no passwordWasSet)
 */

process.env.SECRET_KEY ||= 'test-only-secret-32chars-minimum!!';
process.env.VERIFICATION_TOKEN_SECRET ||= 'test-only-verification-secret!!';

const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const phoneGuard = require('../../../utils/phoneGuard');
const passwordValidator = require('../../../utils/passwordValidator');
const tokenService = require('../../../utils/tokenService');
const verificationToken = require('../../../utils/verificationToken');
const repository = require('../../../src/modules/bus-owner/auth/registration/bus-owner-registration.repository');
const leadRepository = require('../../../src/modules/bus-owner/auth/registration/bus-owner-registration-lead.repository');
const service = require('../../../src/modules/bus-owner/auth/registration/bus-owner-registration.service');

const patch = (obj, name, fn, restores) => {
  const orig = obj[name]; obj[name] = fn;
  restores.push(() => { obj[name] = orig; });
};
const userDoc = () => ({ _id: 'user-1', phone: '9810000000', toObject: () => ({ _id: 'user-1' }) });
const baseInput = { rawPhone: '9810000000', name: 'Owner', companyName: 'Company', verificationToken: 'vt' };

const setupBase = (restores, overrides = {}) => {
  patch(phoneGuard, 'normalizePhone', (p) => p, restores);
  patch(verificationToken, 'validateVerificationToken', () => ({ valid: true }), restores);
  patch(repository, 'findConsumedOtp', async () => ({ updatedAt: new Date() }), restores);
  patch(phoneGuard, 'checkPhoneForRole', async () => ({ exists: true, user: { _id: 'uid-pass' } }), restores);
  patch(tokenService, 'generateTokenPair', async () => ({ accessToken: 'a', refreshToken: 'r' }), restores);
  patch(leadRepository, 'convertOtpVerifiedLead', () => Promise.resolve(), restores);
  if (overrides.hasUsablePassword !== undefined)
    patch(repository, 'hasUsablePassword', async () => overrides.hasUsablePassword, restores);
};

test('bus-owner upgrade edge cases (D5–D8)', async (t) => {

  await t.test('D5: does not inspect user.password directly (select:false pitfall)', async () => {
    const restores = []; let called = false;
    patch(phoneGuard, 'normalizePhone', (p) => p, restores);
    patch(verificationToken, 'validateVerificationToken', () => ({ valid: true }), restores);
    patch(repository, 'findConsumedOtp', async () => ({ updatedAt: new Date() }), restores);
    patch(phoneGuard, 'checkPhoneForRole', async () => ({
      exists: true, user: { _id: 'uid-trap', password: 'trap-value' },
    }), restores);
    patch(repository, 'hasUsablePassword', async () => { called = true; return true; }, restores);
    patch(repository, 'upgradeUserToBusOwner', async () => userDoc(), restores);
    patch(repository, 'findBusOwnerByUser', async () => null, restores);
    patch(repository, 'createBusOwnerProfile', async () => {}, restores);
    patch(tokenService, 'generateTokenPair', async () => ({ accessToken: 'a', refreshToken: 'r' }), restores);
    patch(leadRepository, 'convertOtpVerifiedLead', () => Promise.resolve(), restores);
    try { await service.register({ ...baseInput }); assert.equal(called, true); }
    finally { restores.reverse().forEach((fn) => fn()); }
  });

  await t.test('D6: concurrent upgrade race — null return does not overwrite password', async () => {
    const restores = []; let hashCalled = 0; setupBase(restores, { hasUsablePassword: false });
    patch(passwordValidator, 'validatePassword', () => ({ valid: true, errors: [] }), restores);
    patch(bcrypt, 'hash', async () => { hashCalled++; return `hash-${hashCalled}`; }, restores);
    patch(repository, 'upgradePasswordlessUserToBusOwner', async () => null, restores);
    patch(repository, 'findBusOwnerByUser', async () => ({ _id: 'existing-profile' }), restores);
    patch(repository, 'upgradeUserToBusOwner', async () => userDoc(), restores);
    patch(repository, 'createBusOwnerProfile', async () => assert.fail('no duplicate profile'), restores);
    try { await service.register({ ...baseInput, password: 'ValidP@ss1' }); assert.equal(hashCalled, 1); }
    finally { restores.reverse().forEach((fn) => fn()); }
  });

  await t.test('D7: invalid password for passwordless upgrade → 400', async () => {
    const restores = []; setupBase(restores, { hasUsablePassword: false });
    patch(passwordValidator, 'validatePassword', () => ({ valid: false, errors: ['Too short'] }), restores);
    try {
      await assert.rejects(() => service.register({ ...baseInput, password: 'short' }),
        (err) => { assert.equal(err.statusCode, 400); return true; });
    } finally { restores.reverse().forEach((fn) => fn()); }
  });

  await t.test('D8: successful upgrade response has isUpgrade:true and no passwordWasSet', async () => {
    const restores = []; setupBase(restores, { hasUsablePassword: true });
    patch(repository, 'upgradeUserToBusOwner', async () => userDoc(), restores);
    patch(repository, 'findBusOwnerByUser', async () => null, restores);
    patch(repository, 'createBusOwnerProfile', async () => {}, restores);
    try {
      const result = await service.register({ ...baseInput });
      assert.equal(result.responseBody.isUpgrade, true);
      assert.ok(!('passwordWasSet' in result.responseBody));
      assert.equal(result.responseBody.activeRole, 'busOwner');
    } finally { restores.reverse().forEach((fn) => fn()); }
  });
});
