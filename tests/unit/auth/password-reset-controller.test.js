'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

// Load env before service imports
process.env.SECRET_KEY = 'test-only-secret-32chars-minimum!!';
process.env.VERIFICATION_TOKEN_SECRET = 'test-only-verification-secret!!';
process.env.NODE_ENV = 'test';
process.env.SPARROW_SMS_TOKEN = 'test-stub';

const requestPwdResetSvc = require('../../../src/modules/auth/password-reset/request-password-reset.service');
const verifyResetOtpSvc = require('../../../src/modules/auth/password-reset/verify-reset-otp.service');
const resetPasswordSvc = require('../../../src/modules/auth/password-reset/reset-password.service');
const asyncHandler = require('../../../src/shared/http/async-handler');
const controller = require('../../../src/modules/auth/password-reset/password-reset.controller');

const mockRes = () => {
  const r = { _status: null, _body: null };
  r.status = (s) => { r._status = s; return r; };
  r.json = (b) => { r._body = b; return r; };
  return r;
};

test('Unit: password-reset controller', async (t) => {
  await t.test('requestPasswordReset — exact fields forwarded and statusCode+body used', async () => {
    const requestPwdResetSvc = require('../../../src/modules/auth/password-reset/request-password-reset.service');
    const orig = requestPwdResetSvc.requestPasswordReset;
    let captured;
    requestPwdResetSvc.requestPasswordReset = async (input) => { captured = input; return { statusCode: 200, responseBody: { ok: true } }; };
    try {
      const req = { body: { emailOrPhone: 'myphone@test.com' } };
      const res = mockRes();
      await controller.requestPasswordReset(req, res, () => {});
      assert.equal(captured.emailOrPhone, 'myphone@test.com');
      assert.equal(res._status, 200);
      assert.deepEqual(res._body, { ok: true });
    } finally { requestPwdResetSvc.requestPasswordReset = orig; }
  });

  await t.test('verifyOtpForReset — exact fields forwarded', async () => {
    const svc = require('../../../src/modules/auth/password-reset/verify-reset-otp.service');
    const orig = svc.verifyResetOtp;
    let captured;
    svc.verifyResetOtp = async (input) => { captured = input; return { statusCode: 200, responseBody: {} }; };
    try {
      const req = { body: { emailOrPhone: 'ph', otp: '123456' } };
      const res = mockRes();
      await controller.verifyOtpForReset(req, res, () => {});
      assert.equal(captured.emailOrPhone, 'ph');
      assert.equal(captured.otp, '123456');
    } finally { svc.verifyResetOtp = orig; }
  });

  await t.test('resetPassword — exact fields forwarded', async () => {
    const svc = require('../../../src/modules/auth/password-reset/reset-password.service');
    const orig = svc.resetPassword;
    let captured;
    svc.resetPassword = async (input) => { captured = input; return { statusCode: 200, responseBody: {} }; };
    try {
      const req = { body: { emailOrPhone: 'ph2', otp: '654321', newPassword: 'NewPass1' } };
      const res = mockRes();
      await controller.resetPassword(req, res, () => {});
      assert.equal(captured.emailOrPhone, 'ph2');
      assert.equal(captured.otp, '654321');
      assert.equal(captured.newPassword, 'NewPass1');
    } finally { svc.resetPassword = orig; }
  });

  await t.test('rejected service reaches next via asyncHandler', async () => {
    const svc = require('../../../src/modules/auth/password-reset/request-password-reset.service');
    const orig = svc.requestPasswordReset;
    svc.requestPasswordReset = async () => { throw new Error('boom'); };
    try {
      let nextErr;
      const req = { body: { emailOrPhone: 'x' } };
      await controller.requestPasswordReset(req, mockRes(), (e) => { nextErr = e; });
      assert.ok(nextErr instanceof Error);
    } finally { svc.requestPasswordReset = orig; }
  });
});
