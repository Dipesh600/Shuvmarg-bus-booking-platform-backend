'use strict';

/**
 * tests/unit/bus-owner/bus-owner-upgrade-guard.test.js
 *
 * D1–D4: Core passwordless-to-busOwner upgrade guard invariants.
 *   D1 — hasUsablePassword is queried via DB (not user.password field)
 *   D2 — passwordless upgrade without password → 400
 *   D3 — passwordless upgrade with password → atomic hash+role save
 *   D4 — existing password hash is never overwritten
 */

const {
  createTestPassword,
  createTestSecret,
} = require('../../helpers/security-test-values');

process.env.SECRET_KEY ||= createTestSecret('application-hmac');
process.env.VERIFICATION_TOKEN_SECRET ||= createTestSecret('verification-token');

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

test('bus-owner upgrade guard (D1–D4)', async (t) => {

  await t.test('D1: hasUsablePassword is queried via DB, not user.password field', async () => {
    const restores = []; let called = false; setupBase(restores);
    patch(repository, 'hasUsablePassword', async (id) => { called = true; assert.equal(id, 'uid-pass'); return true; }, restores);
    patch(repository, 'upgradeUserToBusOwner', async () => userDoc(), restores);
    patch(repository, 'findBusOwnerByUser', async () => null, restores);
    patch(repository, 'createBusOwnerProfile', async () => {}, restores);
    try { await service.register({ ...baseInput }); assert.equal(called, true); }
    finally { restores.reverse().forEach((fn) => fn()); }
  });

  await t.test('D2: passwordless upgrade without password → 400', async () => {
    const restores = []; setupBase(restores, { hasUsablePassword: false });
    try {
      await assert.rejects(() => service.register({ ...baseInput }), (err) => {
        assert.equal(err.statusCode, 400); return true;
      });
    } finally { restores.reverse().forEach((fn) => fn()); }
  });

  await t.test('D3: passwordless upgrade saves password+role in one atomic update', async () => {
    const restores = []; const ops = []; setupBase(restores, { hasUsablePassword: false });
    patch(passwordValidator, 'validatePassword', () => ({ valid: true, errors: [] }), restores);
    patch(bcrypt, 'hash', async (p, r) => { ops.push(['hash', r]); return 'new-hash'; }, restores);
    patch(repository, 'upgradePasswordlessUserToBusOwner', async (params) => { ops.push(['atomic', params]); return userDoc(); }, restores);
    patch(repository, 'findBusOwnerByUser', async () => null, restores);
    patch(repository, 'createBusOwnerProfile', async () => {}, restores);
    try {
      const result = await service.register({
        ...baseInput,
        password: createTestPassword('bus-owner-passwordless-upgrade'),
      });
      assert.ok(ops.some(([op, r]) => op === 'hash' && r === 12));
      const a = ops.find(([op]) => op === 'atomic');
      assert.ok(a); assert.equal(a[1].hashedPassword, 'new-hash');
      assert.equal(result.statusCode, 201);
    } finally { restores.reverse().forEach((fn) => fn()); }
  });

  await t.test('D4: existing password hash is never overwritten', async () => {
    const restores = []; let atomicCalled = false; setupBase(restores, { hasUsablePassword: true });
    patch(repository, 'upgradePasswordlessUserToBusOwner', async () => { atomicCalled = true; }, restores);
    patch(repository, 'upgradeUserToBusOwner', async () => userDoc(), restores);
    patch(repository, 'findBusOwnerByUser', async () => null, restores);
    patch(repository, 'createBusOwnerProfile', async () => {}, restores);
    try { await service.register({ ...baseInput }); assert.equal(atomicCalled, false); }
    finally { restores.reverse().forEach((fn) => fn()); }
  });
});
