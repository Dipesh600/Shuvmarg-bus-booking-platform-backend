'use strict';

/**
 * tests/unit/auth/passenger-otp-controller.test.js
 *
 * Unit tests for passenger-otp-auth.controller.js
 * Verifies routing glue: cookie behaviour, error handling, respond calls.
 */

const {
  createTestSecret,
} = require('../../helpers/security-test-values');

process.env.SECRET_KEY ||= createTestSecret('application-hmac');

const test = require('node:test');
const assert = require('node:assert/strict');
const requestService = require('../../../src/modules/auth/passenger-otp-auth/request-passenger-otp.service');
const verifyService = require('../../../src/modules/auth/passenger-otp-auth/verify-passenger-otp.service');
const AppError = require('../../../src/shared/errors/app-error');

const patch = (obj, key, fn, restore) => {
  const old = obj[key];
  obj[key] = fn;
  restore.push(() => { obj[key] = old; });
};

/** Minimal Express res/req mock */
const mockRes = () => {
  const res = { cookies: {}, status: null, body: null };
  res.cookie = (name, val, opts) => { res.cookies[name] = { val, opts }; return res; };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
};
const mockReq = (body = {}) => ({ body, ip: '1.1.1.1', socket: {}, get: () => 'UA' });
const next = () => {};

const { sendOTP, verifyOTP } = require('../../../src/modules/auth/passenger-otp-auth/passenger-otp-auth.controller');

test('passenger OTP controller', async (t) => {
  await t.test('sendOTP passes phone from body to service', async () => {
    const restore = [];
    let capturedPhone;
    patch(requestService, 'requestPassengerOTP', async ({ rawPhone }) => { capturedPhone = rawPhone; return { statusCode: 200, responseBody: { success: true } }; }, restore);
    try {
      const req = mockReq({ phone: '9800000011' });
      const res = mockRes();
      await sendOTP(req, res, next);
      assert.equal(capturedPhone, '9800000011');
      assert.equal(res.statusCode, 200);
    } finally { restore.reverse().forEach((fn) => fn()); }
  });

  await t.test('sendOTP returns AppError response shape on AppError', async () => {
    const restore = [];
    patch(requestService, 'requestPassengerOTP', async () => {
      throw new AppError('bad phone', 400, { success: false, message: 'bad phone', errorCode: 'INVALID_PHONE' });
    }, restore);
    try {
      const res = mockRes();
      await sendOTP(mockReq({ phone: 'x' }), res, next);
      assert.equal(res.statusCode, 400);
      assert.equal(res.body.errorCode, 'INVALID_PHONE');
    } finally { restore.reverse().forEach((fn) => fn()); }
  });

  await t.test('sendOTP returns 500 on unexpected error', async () => {
    const restore = [];
    patch(requestService, 'requestPassengerOTP', async () => { throw new Error('boom'); }, restore);
    try {
      const res = mockRes();
      await sendOTP(mockReq({ phone: '9800000012' }), res, next);
      assert.equal(res.statusCode, 500);
    } finally { restore.reverse().forEach((fn) => fn()); }
  });

  await t.test('verifyOTP sets httpOnly refreshToken cookie on success', async () => {
    const restore = [];
    patch(verifyService, 'verifyPassengerOTPAndCreateSession', async () => ({
      statusCode: 200,
      refreshToken: 'rt123',
      responseBody: { success: true, accessToken: 'at', activeRole: 'passenger' },
    }), restore);
    try {
      const res = mockRes();
      await verifyOTP(mockReq({ phone: '9800000013', otp: '123456' }), res, next);
      assert.ok(res.cookies.passengerRefreshToken, 'cookie must be set');
      assert.equal(res.cookies.passengerRefreshToken.val, 'rt123');
      assert.equal(res.cookies.passengerRefreshToken.opts.httpOnly, true);
      assert.equal(res.body.refreshToken, undefined, 'must not appear in response body');
    } finally { restore.reverse().forEach((fn) => fn()); }
  });

  await t.test('verifyOTP passes deviceInfo and ipAddress to service', async () => {
    const restore = [];
    let capturedMeta;
    patch(verifyService, 'verifyPassengerOTPAndCreateSession', async (args) => { capturedMeta = args; return { statusCode: 200, refreshToken: null, responseBody: { success: true } }; }, restore);
    try {
      const req = mockReq({ phone: '9800000014', otp: '654321' });
      await verifyOTP(req, mockRes(), next);
      assert.equal(capturedMeta.deviceInfo, 'UA');
      assert.ok(capturedMeta.ipAddress);
    } finally { restore.reverse().forEach((fn) => fn()); }
  });

  await t.test('verifyOTP does not set cookie when refreshToken is null', async () => {
    const restore = [];
    patch(verifyService, 'verifyPassengerOTPAndCreateSession', async () => ({ statusCode: 200, refreshToken: null, responseBody: { success: true } }), restore);
    try {
      const res = mockRes();
      await verifyOTP(mockReq({ phone: '9800000015', otp: '999999' }), res, next);
      assert.equal(res.cookies.passengerRefreshToken, undefined);
    } finally { restore.reverse().forEach((fn) => fn()); }
  });
});
