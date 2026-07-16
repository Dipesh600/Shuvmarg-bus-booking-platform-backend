'use strict';
process.env.SECRET_KEY = 'test-only-secret-32chars-minimum!!';
process.env.VERIFICATION_TOKEN_SECRET = 'test-only-verification-secret!!';
process.env.SPARROW_SMS_TOKEN = 'test-stub';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const AppError = require('../../../src/shared/errors/app-error');
const service = require('../../../src/modules/auth/registration/complete-registration.service');
const repository = require('../../../src/modules/auth/registration/registration.repository');
const referralCodeGenerator = require('../../../handlers/referralCodeGenerator');

function validToken(phone) {
  return jwt.sign({ phone, purpose: 'REGISTRATION', nonce: 'abc' }, process.env.VERIFICATION_TOKEN_SECRET, { expiresIn: '30m' });
}

const goodInput = (phone = '9800000050') => ({
  phone, name: 'Test', address: 'KTM', gender: 'male', password: 'StrongPass1',
  verificationToken: validToken(phone),
});

const stubRepo = (overrides = {}) => ({
  isPhoneRegistered: async () => ({ registered: false }),
  findUsedRegistrationOtp: async () => ({ updatedAt: new Date() }),
  findUserByEmail: async () => null,
  findUserByReferralCode: async () => null,
  saveReferrerReward: async () => {},
  createPassenger: async (d) => ({ _id: 'uid123', phone: d.phone, email: d.email }),
  createReferralHistory: async () => {},
  ...overrides,
});

test('Unit: completeRegistration service', async (t) => {
  const origGenerate = referralCodeGenerator.generateReferralCode;
  const origCreatePassenger = repository.createPassenger;
  const origFindUsed = repository.findUsedRegistrationOtp;
  const origIsPhone = repository.isPhoneRegistered;

  t.afterEach(() => {
    referralCodeGenerator.generateReferralCode = origGenerate;
    repository.createPassenger = origCreatePassenger;
    repository.findUsedRegistrationOtp = origFindUsed;
    repository.isPhoneRegistered = origIsPhone;
  });

  await t.test('missing required field → AppError 400', async () => {
    const { verificationToken: vt, ...noPhone } = goodInput();
    await assert.rejects(
      () => service.completeRegistration({ ...noPhone, verificationToken: vt, phone: undefined }),
      (err) => { assert.equal(err instanceof AppError, true); assert.equal(err.statusCode, 400); return true; }
    );
  });

  await t.test('invalid verification token → AppError 400', async () => {
    await assert.rejects(
      () => service.completeRegistration({ ...goodInput(), verificationToken: 'invalid.token.x' }),
      (err) => { assert.equal(err instanceof AppError, true); assert.equal(err.statusCode, 400); return true; }
    );
  });

  await t.test('no used OTP record → AppError 400', async () => {
    repository.findUsedRegistrationOtp = async () => null;
    await assert.rejects(
      () => service.completeRegistration(goodInput()),
      (err) => { assert.equal(err instanceof AppError, true); assert.equal(err.statusCode, 400); return true; }
    );
  });

  await t.test('bcrypt called with cost 12', async () => {
    let capturedCost;
    const origHash = bcrypt.hash;
    bcrypt.hash = async (p, cost) => { capturedCost = cost; return origHash(p, 4); };

    repository.findUsedRegistrationOtp = async () => ({ updatedAt: new Date() });
    repository.isPhoneRegistered = async () => ({ registered: false });
    repository.createPassenger = async (d) => ({ _id: 'u1', phone: d.phone, email: d.email });
    referralCodeGenerator.generateReferralCode = async () => 'SHUV-TST00';

    await service.completeRegistration(goodInput());
    assert.equal(capturedCost, 12);
    bcrypt.hash = origHash;
  });

  await t.test('email absent → no email property on saved user', async () => {
    repository.findUsedRegistrationOtp = async () => ({ updatedAt: new Date() });
    repository.isPhoneRegistered = async () => ({ registered: false });
    referralCodeGenerator.generateReferralCode = async () => 'SHUV-TST01';
    let savedData;
    repository.createPassenger = async (d) => { savedData = d; return { _id: 'u2', phone: d.phone, email: d.email }; };

    await service.completeRegistration(goodInput('9800000051'));
    assert.equal(Object.prototype.hasOwnProperty.call(savedData, 'email'), false);
  });
});
