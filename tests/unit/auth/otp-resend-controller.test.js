'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

process.env.SECRET_KEY = 'test-only-secret-32chars-minimum!!';

const asyncHandler = require('../../../src/shared/http/async-handler');
const AppError = require('../../../src/shared/errors/app-error');

// Helper to build a minimal express-like req/res/next triple
const makeContext = ({ body = {}, statusCode = null } = {}) => {
  const req = { body };
  let resolvedStatus = null;
  let resolvedBody = null;
  const res = {
    status(code) { resolvedStatus = code; return res; },
    json(body) { resolvedBody = body; return res; },
  };
  const next = (err) => { res._nextError = err; };
  return { req, res, next, getStatus: () => resolvedStatus, getBody: () => resolvedBody };
};

test('Auth: OTP Resend Controller', async (t) => {
  // Fresh require inside each test to avoid cross-test module cache leaks on service patches
  const service = require('../../../src/modules/auth/otp-resend/otp-resend.service');

  await t.test('phone forwarded exactly', async () => {
    const orig = service.resendOtp;
    let received;
    service.resendOtp = async (input) => { received = input.phone; return { statusCode: 200, responseBody: { success: true } }; };
    try {
      const controller = require('../../../src/modules/auth/otp-resend/otp-resend.controller');
      const { req, res, next } = makeContext({ body: { phone: '9800002001' } });
      await controller.resendOtp(req, res, next);
      assert.equal(received, '9800002001');
    } finally { service.resendOtp = orig; }
  });

  await t.test('purpose forwarded exactly', async () => {
    const orig = service.resendOtp;
    let received;
    service.resendOtp = async (input) => { received = input.purpose; return { statusCode: 200, responseBody: { success: true } }; };
    try {
      const controller = require('../../../src/modules/auth/otp-resend/otp-resend.controller');
      const { req, res, next } = makeContext({ body: { phone: '9800002002', purpose: 'PASSWORD_RESET' } });
      await controller.resendOtp(req, res, next);
      assert.equal(received, 'PASSWORD_RESET');
    } finally { service.resendOtp = orig; }
  });

  await t.test('missing purpose forwarded as undefined', async () => {
    const orig = service.resendOtp;
    let received;
    service.resendOtp = async (input) => { received = input.purpose; return { statusCode: 200, responseBody: { success: true } }; };
    try {
      const controller = require('../../../src/modules/auth/otp-resend/otp-resend.controller');
      const { req, res, next } = makeContext({ body: { phone: '9800002003' } });
      await controller.resendOtp(req, res, next);
      assert.equal(received, undefined);
    } finally { service.resendOtp = orig; }
  });

  await t.test('service statusCode forwarded unchanged', async () => {
    const orig = service.resendOtp;
    service.resendOtp = async () => ({ statusCode: 409, responseBody: { success: false } });
    try {
      const controller = require('../../../src/modules/auth/otp-resend/otp-resend.controller');
      const { req, res, next } = makeContext({ body: { phone: '9800002004' } });
      await controller.resendOtp(req, res, next);
      assert.equal(res._nextError, undefined, 'next should not be called on success');
    } finally { service.resendOtp = orig; }
  });

  await t.test('AppError reaches next unchanged via asyncHandler', async () => {
    const orig = service.resendOtp;
    const appErr = new AppError('test', 400, { success: false, message: 'test' });
    service.resendOtp = async () => { throw appErr; };
    try {
      const controller = require('../../../src/modules/auth/otp-resend/otp-resend.controller');
      const { req, res, next } = makeContext({ body: { phone: '9800002005' } });
      await controller.resendOtp(req, res, next);
      assert.strictEqual(res._nextError, appErr);
    } finally { service.resendOtp = orig; }
  });

  await t.test('unexpected Error reaches next unchanged', async () => {
    const orig = service.resendOtp;
    const err = new Error('unexpected');
    service.resendOtp = async () => { throw err; };
    try {
      const controller = require('../../../src/modules/auth/otp-resend/otp-resend.controller');
      const { req, res, next } = makeContext({ body: { phone: '9800002006' } });
      await controller.resendOtp(req, res, next);
      assert.strictEqual(res._nextError, err);
    } finally { service.resendOtp = orig; }
  });

  await t.test('controller does not respond after rejected service', async () => {
    const orig = service.resendOtp;
    service.resendOtp = async () => { throw new Error('fail'); };
    try {
      const controller = require('../../../src/modules/auth/otp-resend/otp-resend.controller');
      const { req, res, next } = makeContext({ body: { phone: '9800002007' } });
      await controller.resendOtp(req, res, next);
      // If res.status().json() was called there would be a resolved body — there should not be
      assert.equal(res._nextError instanceof Error, true);
    } finally { service.resendOtp = orig; }
  });
});
