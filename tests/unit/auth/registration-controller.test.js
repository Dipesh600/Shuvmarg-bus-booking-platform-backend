'use strict';
process.env.SECRET_KEY = 'test-only-secret-32chars-minimum!!';
process.env.VERIFICATION_TOKEN_SECRET = 'test-only-verification-secret!!';
process.env.SPARROW_SMS_TOKEN = 'test-stub';

const test = require('node:test');
const assert = require('node:assert/strict');

const sendOtpService = require('../../../src/modules/auth/registration/send-phone-otp.service');
const verifyOtpService = require('../../../src/modules/auth/registration/verify-phone-otp.service');
const completeService = require('../../../src/modules/auth/registration/complete-registration.service');
const controller = require('../../../src/modules/auth/registration/registration.controller');

// Safe monkey-patch helper: always restores in finally
const patchMethod = (obj, key, replacement) => {
  const original = obj[key];
  obj[key] = replacement;
  return () => { obj[key] = original; };
};

const makeFakeRes = () => {
  const res = {};
  res.status = (code) => { res._code = code; return res; };
  res.json = (body) => { res._body = body; return res; };
  return res;
};

test('Unit: registration controller — sendPhoneOTP', async (t) => {
  await t.test('forwards phone and statusCode+responseBody unchanged', async () => {
    const restore = patchMethod(sendOtpService, 'sendPhoneOTP',
      async ({ phone }) => { assert.equal(phone, '9800000001'); return { statusCode: 200, responseBody: { status: true } }; }
    );
    try {
      const req = { body: { phone: '9800000001' } };
      const res = makeFakeRes();
      await controller.sendPhoneOTP(req, res, (e) => { throw e; });
      assert.equal(res._code, 200);
      assert.deepEqual(res._body, { status: true });
    } finally { restore(); }
  });

  await t.test('service rejection reaches next via asyncHandler', async () => {
    const boom = new Error('svc-boom');
    const restore = patchMethod(sendOtpService, 'sendPhoneOTP', async () => { throw boom; });
    try {
      let caught;
      const req = { body: { phone: '9800000001' } };
      await controller.sendPhoneOTP(req, makeFakeRes(), (e) => { caught = e; });
      assert.equal(caught, boom);
    } finally { restore(); }
  });
});

test('Unit: registration controller — verifyPhoneOTP', async (t) => {
  await t.test('forwards phone and otp; passes statusCode+responseBody unchanged', async () => {
    const restore = patchMethod(verifyOtpService, 'verifyPhoneOTP', async ({ phone, otp }) => {
      assert.equal(phone, '9800000002');
      assert.equal(otp, '654321');
      return { statusCode: 200, responseBody: { status: true, verificationToken: 'tok' } };
    });
    try {
      const req = { body: { phone: '9800000002', otp: '654321' } };
      const res = makeFakeRes();
      await controller.verifyPhoneOTP(req, res, (e) => { throw e; });
      assert.equal(res._code, 200);
      assert.equal(res._body.verificationToken, 'tok');
    } finally { restore(); }
  });

  await t.test('service rejection reaches next', async () => {
    const boom = new Error('verify-boom');
    const restore = patchMethod(verifyOtpService, 'verifyPhoneOTP', async () => { throw boom; });
    try {
      let caught;
      await controller.verifyPhoneOTP({ body: {} }, makeFakeRes(), (e) => { caught = e; });
      assert.equal(caught, boom);
    } finally { restore(); }
  });
});

test('Unit: registration controller — completeRegistration', async (t) => {
  await t.test('forwards all body fields, ip, user-agent; passes statusCode+responseBody', async () => {
    let captured;
    const restore = patchMethod(completeService, 'completeRegistration', async (input) => {
      captured = input;
      return { statusCode: 201, responseBody: { status: true, data: { userId: 'u1' } } };
    });
    try {
      const req = {
        body: { phone: '98', name: 'N', email: 'e@e.com', address: 'A', password: 'P',
                gender: 'male', referralCode: 'SHUV-XX001', verificationToken: 'vt' },
        ip: '1.2.3.4',
        get: (h) => h === 'User-Agent' ? 'TestAgent/1' : null,
      };
      const res = makeFakeRes();
      await controller.completeRegistration(req, res, (e) => { throw e; });
      assert.equal(captured.phone, '98');
      assert.equal(captured.name, 'N');
      assert.equal(captured.email, 'e@e.com');
      assert.equal(captured.address, 'A');
      assert.equal(captured.password, 'P');
      assert.equal(captured.gender, 'male');
      assert.equal(captured.referralCode, 'SHUV-XX001');
      assert.equal(captured.verificationToken, 'vt');
      assert.equal(captured.ipAddress, '1.2.3.4');
      assert.equal(captured.deviceInfo, 'TestAgent/1');
      assert.equal(res._code, 201);
    } finally { restore(); }
  });

  await t.test('falls back to req.connection.remoteAddress when req.ip is falsy', async () => {
    let capturedIp;
    const restore = patchMethod(completeService, 'completeRegistration', async (input) => {
      capturedIp = input.ipAddress;
      return { statusCode: 201, responseBody: {} };
    });
    try {
      const req = { body: {}, ip: undefined, connection: { remoteAddress: '5.6.7.8' }, get: () => null };
      await controller.completeRegistration(req, makeFakeRes(), (e) => { throw e; });
      assert.equal(capturedIp, '5.6.7.8');
    } finally { restore(); }
  });

  await t.test('service rejection reaches next', async () => {
    const boom = new Error('complete-boom');
    const restore = patchMethod(completeService, 'completeRegistration', async () => { throw boom; });
    try {
      let caught;
      const req = { body: {}, ip: null, connection: {}, get: () => null };
      await controller.completeRegistration(req, makeFakeRes(), (e) => { caught = e; });
      assert.equal(caught, boom);
    } finally { restore(); }
  });
});
