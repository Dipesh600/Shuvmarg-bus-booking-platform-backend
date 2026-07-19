'use strict';

process.env.SECRET_KEY ||= 'test-only-secret-32chars-minimum!!';
process.env.VERIFICATION_TOKEN_SECRET ||= 'test-only-verification-secret!!';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const phoneGuard = require('../../../utils/phoneGuard');
const otpHelper = require('../../../utils/otpHelper');
const passwordValidator = require('../../../utils/passwordValidator');
const tokenService = require('../../../utils/tokenService');
const verificationToken = require('../../../utils/verificationToken');
const repository = require('../../../src/modules/bus-owner/auth/registration/bus-owner-registration.repository');
const leadRepository = require('../../../src/modules/bus-owner/auth/registration/bus-owner-registration-lead.repository');
const service = require('../../../src/modules/bus-owner/auth/registration/bus-owner-registration.service');

const credential = crypto.randomBytes(24).toString('hex');
const patch = (obj, name, fn, restores) => {
  const orig = obj[name];
  obj[name] = fn;
  restores.push(() => { obj[name] = orig; });
};
const userDoc = () => ({
  _id: 'user-1',
  phone: '9810000000',
  toObject: () => ({ _id: 'user-1', phone: '9810000000', password: 'hash' }),
});

test('bus-owner registration service preserves orchestration order', async (t) => {
  await t.test('sendOTP normalizes, checks role and conditionally sends OTP', async () => {
    const restores = [];
    const order = [];
    patch(phoneGuard, 'normalizePhone', (p) => { order.push('normalize'); return p; }, restores);
    patch(phoneGuard, 'checkPhoneForRole', async () => { order.push('role'); return { exists: false }; }, restores);
    patch(otpHelper, 'createAndSendOTP', async (...args) => { order.push(['otp', args]); }, restores);
    try {
      const result = await service.sendOTP({ rawPhone: '9810000000' });
      assert.deepEqual(order, ['normalize', 'role', ['otp', ['9810000000', 'BUSOWNER_REGISTRATION']]]);
      assert.equal(result.statusCode, 200);
    } finally { restores.reverse().forEach((fn) => fn()); }
  });

  await t.test('verifyOTP order starts lead upsert before issuing token', async () => {
    const restores = [];
    const order = [];
    patch(phoneGuard, 'normalizePhone', (p) => { order.push('normalize'); return p; }, restores);
    patch(otpHelper, 'verifyOTPCode', async (...args) => { order.push(['verify', args]); return { valid: true }; }, restores);
    patch(phoneGuard, 'checkPhoneForRole', async () => { order.push('role'); return { exists: false }; }, restores);
    patch(leadRepository, 'upsertOtpVerifiedLead', () => { order.push('lead'); return Promise.resolve(); }, restores);
    patch(verificationToken, 'issueVerificationToken', (...args) => { order.push(['token', args]); return 'vt'; }, restores);
    try {
      const result = await service.verifyOTP({ rawPhone: '9810000000', otp: '12-34 56' });
      assert.deepEqual(order, [
        'normalize',
        ['verify', ['9810000000', '123456', 'BUSOWNER_REGISTRATION']],
        'role',
        'lead',
        ['token', ['9810000000', 'BUSOWNER_REGISTRATION']],
      ]);
      assert.equal(result.responseBody.verificationToken, 'vt');
    } finally { restores.reverse().forEach((fn) => fn()); }
  });

  await t.test('new-user registration order and token/profile boundaries', async () => {
    const restores = [];
    const order = [];
    patch(phoneGuard, 'normalizePhone', (p) => p, restores);
    patch(verificationToken, 'validateVerificationToken', () => ({ valid: true }), restores);
    patch(repository, 'findConsumedOtp', async () => ({ updatedAt: new Date() }), restores);
    patch(phoneGuard, 'checkPhoneForRole', async () => { order.push('role'); return { exists: false }; }, restores);
    patch(passwordValidator, 'validatePassword', () => ({ valid: true, errors: [] }), restores);
    patch(repository, 'findUserByEmail', async () => { order.push('email'); return null; }, restores);
    patch(bcrypt, 'hash', async (...args) => { order.push(['hash', args[1]]); return 'hash'; }, restores);
    patch(repository, 'createUser', async () => { order.push('createUser'); return userDoc(); }, restores);
    patch(repository, 'findBusOwnerByUser', async () => { order.push('findProfile'); return null; }, restores);
    patch(repository, 'createBusOwnerProfile', async () => { order.push('createProfile'); }, restores);
    patch(tokenService, 'generateTokenPair', async () => { order.push('tokens'); return { accessToken: 'a', refreshToken: 'r' }; }, restores);
    patch(leadRepository, 'convertOtpVerifiedLead', () => { order.push('lead'); return Promise.resolve(); }, restores);
    try {
      const result = await service.register({
        rawPhone: '9810000000',
        name: 'Owner',
        companyName: 'Company',
        password: credential,
        email: 'a@b.com',
        verificationToken: 'vt',
      });
      assert.deepEqual(order, ['role', 'email', ['hash', 12], 'createUser', 'findProfile', 'createProfile', 'tokens', 'lead']);
      assert.equal(result.statusCode, 201);
      assert.equal(result.responseBody.user.password, undefined);
    } finally { restores.reverse().forEach((fn) => fn()); }
  });

  await t.test('upgrade skips password validation/hash and preserves profile', async () => {
    const restores = [];
    const order = [];
    patch(phoneGuard, 'normalizePhone', (p) => p, restores);
    patch(verificationToken, 'validateVerificationToken', () => ({ valid: true }), restores);
    patch(repository, 'findConsumedOtp', async () => ({ updatedAt: new Date() }), restores);
    patch(phoneGuard, 'checkPhoneForRole', async () => ({ exists: true, user: { _id: 'u' } }), restores);
    patch(bcrypt, 'hash', async () => assert.fail('upgrade must not hash'), restores);
    patch(repository, 'upgradeUserToBusOwner', async () => { order.push('upgrade'); return userDoc(); }, restores);
    patch(repository, 'findBusOwnerByUser', async () => { order.push('findProfile'); return { _id: 'profile' }; }, restores);
    patch(repository, 'createBusOwnerProfile', async () => assert.fail('existing profile preserved'), restores);
    patch(tokenService, 'generateTokenPair', async () => { order.push('tokens'); return { accessToken: 'a' }; }, restores);
    patch(leadRepository, 'convertOtpVerifiedLead', () => Promise.resolve(), restores);
    try {
      await service.register({ rawPhone: '9810000000', name: 'Owner', companyName: 'Company', verificationToken: 'vt' });
      assert.deepEqual(order, ['upgrade', 'findProfile', 'tokens']);
    } finally { restores.reverse().forEach((fn) => fn()); }
  });
});
