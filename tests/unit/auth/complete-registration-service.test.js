'use strict';
process.env.SECRET_KEY = 'test-only-secret-32chars-minimum!!';
process.env.VERIFICATION_TOKEN_SECRET = 'test-only-verification-secret!!';
process.env.SPARROW_SMS_TOKEN = 'test-stub';

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const AppError = require('../../../src/shared/errors/app-error');
const service = require('../../../src/modules/auth/registration/complete-registration.service');
const repository = require('../../../src/modules/auth/registration/registration.repository');
const referralService = require('../../../src/modules/auth/registration/referral.service');
const referralCodeGenerator = require('../../../handlers/referralCodeGenerator');

const patchMethod = (obj, key, fn) => {
  const orig = obj[key];
  obj[key] = fn;
  return () => { obj[key] = orig; };
};

function validToken(phone) {
  return jwt.sign({ phone, purpose: 'REGISTRATION', nonce: 'abc' },
    process.env.VERIFICATION_TOKEN_SECRET, { expiresIn: '30m' });
}

const goodInput = (phone = '9800000050') => ({
  phone, name: 'Test', address: 'KTM', gender: 'male', password: 'StrongPass1',
  verificationToken: validToken(phone),
});

const makeStubs = () => {
  const stubs = [];
  stubs.push(patchMethod(repository, 'findUsedRegistrationOtp', async () => ({ updatedAt: new Date() })));
  stubs.push(patchMethod(repository, 'isPhoneRegistered', async () => ({ registered: false })));
  stubs.push(patchMethod(repository, 'findUserByEmail', async () => null));
  stubs.push(patchMethod(repository, 'createPassenger', async (d) => ({ _id: 'u1', phone: d.phone, email: d.email })));
  stubs.push(patchMethod(referralCodeGenerator, 'generateReferralCode', async () => 'SHUV-TST00'));
  return () => stubs.forEach((r) => r());
};

test('Unit: completeRegistration service', async (t) => {
  await t.test('missing required field → AppError 400', async () => {
    const input = { ...goodInput(), phone: undefined };
    await assert.rejects(() => service.completeRegistration(input), (err) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.statusCode, 400);
      return true;
    });
  });

  await t.test('invalid verification token → AppError 400', async () => {
    await assert.rejects(() => service.completeRegistration({ ...goodInput(), verificationToken: 'invalid.token.x' }),
      (err) => { assert.ok(err instanceof AppError); assert.equal(err.statusCode, 400); return true; }
    );
  });

  await t.test('no used OTP record → AppError 400', async () => {
    const restore = patchMethod(repository, 'findUsedRegistrationOtp', async () => null);
    try {
      await assert.rejects(() => service.completeRegistration(goodInput()),
        (err) => { assert.ok(err instanceof AppError); assert.equal(err.statusCode, 400); return true; }
      );
    } finally { restore(); }
  });

  await t.test('bcrypt called with cost 12', async () => {
    const restoreStubs = makeStubs();
    let capturedCost;
    const origHash = bcrypt.hash;
    bcrypt.hash = async (p, cost) => { capturedCost = cost; return origHash(p, 4); };
    try {
      await service.completeRegistration(goodInput());
      assert.equal(capturedCost, 12);
    } finally {
      bcrypt.hash = origHash;
      restoreStubs();
    }
  });

  await t.test('email absent → no email property on saved user data', async () => {
    const restoreStubs = makeStubs();
    let savedData;
    const restorePassenger = patchMethod(repository, 'createPassenger',
      async (d) => { savedData = d; return { _id: 'u2', phone: d.phone, email: d.email }; }
    );
    try {
      await service.completeRegistration(goodInput('9800000051'));
      assert.equal(Object.prototype.hasOwnProperty.call(savedData, 'email'), false);
    } finally {
      restorePassenger();
      restoreStubs();
    }
  });

  await t.test('ordering: applyReferrerReward completes before createPassenger', async () => {
    const calls = [];
    const restoreStubs = makeStubs();
    const restoreApply = patchMethod(referralService, 'applyReferrerReward',
      async () => { calls.push('reward'); }
    );
    const restorePassenger = patchMethod(repository, 'createPassenger',
      async (d) => { calls.push('passenger'); return { _id: 'u3', phone: d.phone }; }
    );
    const restoreResolve = patchMethod(referralService, 'resolveReferral',
      async () => ({ referredBy: 'ref_id', yatrapoints: 10, referrerUser: {} })
    );
    const restoreHistory = patchMethod(referralService, 'createReferralHistoryRecord', async () => {});
    try {
      await service.completeRegistration({ ...goodInput('9800000052'), referralCode: 'SHUV-ORD00' });
      assert.deepEqual(calls, ['reward', 'passenger']);
    } finally {
      restoreHistory();
      restoreResolve();
      restorePassenger();
      restoreApply();
      restoreStubs();
    }
  });
});
