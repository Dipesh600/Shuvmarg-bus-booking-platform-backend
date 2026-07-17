'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

process.env.SECRET_KEY = 'test-only-secret-32chars-minimum!!';

const requestPwdResetSvc = require('../../../src/modules/auth/password-reset/request-password-reset.service');
const verifyResetOtpSvc = require('../../../src/modules/auth/password-reset/verify-reset-otp.service');
const resetPasswordSvc = require('../../../src/modules/auth/password-reset/reset-password.service');
const AppError = require('../../../src/shared/errors/app-error');
const controller = require('../../../src/modules/auth/password-reset/password-reset.controller');

const mockRes = () => {
  const r = { _status: null, _body: null };
  r.status = (s) => { r._status = s; return r; };
  r.json = (b) => { r._body = b; return r; };
  return r;
};

test('Unit: password-reset controller', async (t) => {
  await t.test('requestPasswordReset — exact fields forwarded and statusCode+body used', async () => {
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
    const orig = verifyResetOtpSvc.verifyResetOtp;
    let captured;
    verifyResetOtpSvc.verifyResetOtp = async (input) => { captured = input; return { statusCode: 200, responseBody: {} }; };
    try {
      const req = { body: { emailOrPhone: 'ph', otp: '123456' } };
      const res = mockRes();
      await controller.verifyOtpForReset(req, res, () => {});
      assert.equal(captured.emailOrPhone, 'ph');
      assert.equal(captured.otp, '123456');
    } finally { verifyResetOtpSvc.verifyResetOtp = orig; }
  });

  await t.test('resetPassword — exact fields forwarded', async () => {
    const orig = resetPasswordSvc.resetPassword;
    let captured;
    resetPasswordSvc.resetPassword = async (input) => { captured = input; return { statusCode: 200, responseBody: {} }; };
    try {
      const req = { body: { emailOrPhone: 'ph2', otp: '654321', newPassword: 'NewPass1' } };
      const res = mockRes();
      await controller.resetPassword(req, res, () => {});
      assert.equal(captured.emailOrPhone, 'ph2');
      assert.equal(captured.otp, '654321');
      assert.equal(captured.newPassword, 'NewPass1');
    } finally { resetPasswordSvc.resetPassword = orig; }
  });

  await t.test('AppError reaches next unchanged', async () => {
    const orig = requestPwdResetSvc.requestPasswordReset;
    const expected = new AppError('Expected', 400, { status: false, message: 'Expected error' });
    requestPwdResetSvc.requestPasswordReset = async () => { throw expected; };
    try {
      let nextErr;
      const res = mockRes();
      await controller.requestPasswordReset({ body: { emailOrPhone: 'x' } }, res, (e) => { nextErr = e; });
      assert.equal(nextErr, expected);
      assert.equal(res._status, null);
      assert.equal(res._body, null);
    } finally { requestPwdResetSvc.requestPasswordReset = orig; }
  });

  await t.test('unexpected Error reaches next unchanged', async () => {
    const orig = requestPwdResetSvc.requestPasswordReset;
    const expected = new Error('boom');
    requestPwdResetSvc.requestPasswordReset = async () => { throw expected; };
    try {
      let nextErr;
      const res = mockRes();
      await controller.requestPasswordReset({ body: { emailOrPhone: 'x' } }, res, (e) => { nextErr = e; });
      assert.equal(nextErr, expected);
      assert.equal(res._status, null);
      assert.equal(res._body, null);
    } finally { requestPwdResetSvc.requestPasswordReset = orig; }
  });
});
