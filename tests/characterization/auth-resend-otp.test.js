'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../helpers/app');
const db = require('../helpers/db');
const User = require('../../models/userModel');
const otpHelper = require('../../utils/otpHelper');
const phoneGuard = require('../../utils/phoneGuard');

const PW = '$2a$12$aaaaaaaaaaaaaaaaaaaaaa.BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
const seedUser = (phone) =>
  User.create({ name: 'OTP Tester', phone, password: PW, role: 'passenger', roles: ['passenger'], isVerified: true, deletedAt: null });
const send = (body) => request(app).post('/api/resendOtp').send(body);
const noOtp = () => { const o = otpHelper.createAndSendOTP; otpHelper.createAndSendOTP = async () => { throw new Error('should not be called'); }; return () => { otpHelper.createAndSendOTP = o; }; };
test('Auth: resendOtp', async (t) => {
  await db.connect();
  t.after(() => db.disconnect());
  t.beforeEach(() => db.clearAll());

  await t.test('empty body → middleware 400 with period', async () => {
    const res = await send({});
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { success: false, message: 'Phone number is required.' });
  });
  await t.test('invalid purpose → 400, OTP not called', async () => {
    const restore = noOtp();
    try {
      const res = await send({ phone: '9800001001', purpose: 'INVALID' });
      assert.equal(res.status, 400);
      assert.deepEqual(res.body, { success: false, message: 'Invalid OTP purpose.' });
    } finally { restore(); }
  });
  await t.test('default purpose is REGISTRATION', async () => {
    const origReg = phoneGuard.isPhoneRegistered;
    const origOtp = otpHelper.createAndSendOTP;
    let capturedPurpose;
    phoneGuard.isPhoneRegistered = async () => ({ registered: false });
    otpHelper.createAndSendOTP = async (p, pur) => { capturedPurpose = pur; return { expiresIn: 300 }; };
    try {
      await send({ phone: '9800001010' });
      assert.equal(capturedPurpose, 'REGISTRATION');
    } finally { phoneGuard.isPhoneRegistered = origReg; otpHelper.createAndSendOTP = origOtp; }
  });

  await t.test('REGISTRATION unregistered → 200 with expiresIn, raw phone passed', async () => {
    const origReg = phoneGuard.isPhoneRegistered;
    const origOtp = otpHelper.createAndSendOTP;
    let regPhone, otpPhone;
    phoneGuard.isPhoneRegistered = async (p) => { regPhone = p; return { registered: false }; };
    otpHelper.createAndSendOTP = async (p) => { otpPhone = p; return { expiresIn: 300 }; };
    try {
      const res = await send({ phone: '9800001020', purpose: 'REGISTRATION' });
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok('expiresIn' in res.body.data);
      assert.equal(regPhone, '9800001020');
      assert.equal(otpPhone, '9800001020');
    } finally { phoneGuard.isPhoneRegistered = origReg; otpHelper.createAndSendOTP = origOtp; }
  });

  await t.test('REGISTRATION registered phone → 409, OTP not called', async () => {
    const origReg = phoneGuard.isPhoneRegistered;
    const restore = noOtp();
    let called = false;
    phoneGuard.isPhoneRegistered = async () => ({ registered: true });
    otpHelper.createAndSendOTP = async () => { called = true; return { expiresIn: 300 }; };
    try {
      const res = await send({ phone: '9800001022', purpose: 'REGISTRATION' });
      assert.equal(res.status, 409);
      assert.deepEqual(res.body, { success: false, message: 'This phone number is already registered.', errorCode: 'PHONE_ALREADY_REGISTERED' });
      assert.equal(called, false);
    } finally { phoneGuard.isPhoneRegistered = origReg; restore(); }
  });

  await t.test('PASSWORD_RESET unknown user → generic 200, no data, OTP not called', async () => {
    const restore = noOtp();
    try {
      const res = await send({ phone: '9800001030', purpose: 'PASSWORD_RESET' });
      assert.equal(res.status, 200);
      assert.deepEqual(res.body, { success: true, message: 'If an account exists, a new OTP has been sent.' });
      assert.equal('data' in res.body, false);
    } finally { restore(); }
  });

  await t.test('PASSWORD_RESET existing user → 200, raw phone to OTP helper', async () => {
    await seedUser('9800001031');
    const origOtp = otpHelper.createAndSendOTP;
    let otpPhone, otpPurpose;
    otpHelper.createAndSendOTP = async (p, pur) => { otpPhone = p; otpPurpose = pur; return { expiresIn: 300 }; };
    try {
      const res = await send({ phone: '9800001031', purpose: 'PASSWORD_RESET' });
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(otpPhone, '9800001031');
      assert.equal(otpPurpose, 'PASSWORD_RESET');
    } finally { otpHelper.createAndSendOTP = origOtp; }
  });

  await t.test('ACCOUNT_ACTIVATION → no account check, OTP sent', async () => {
    const origReg = phoneGuard.isPhoneRegistered;
    const origOtp = otpHelper.createAndSendOTP;
    let regCalled = false; let capturedPurpose;
    phoneGuard.isPhoneRegistered = async () => { regCalled = true; return { registered: false }; };
    otpHelper.createAndSendOTP = async (p, pur) => { capturedPurpose = pur; return { expiresIn: 300 }; };
    try {
      const res = await send({ phone: '9800001040', purpose: 'ACCOUNT_ACTIVATION' });
      assert.equal(res.status, 200);
      assert.equal(regCalled, false);
      assert.equal(capturedPurpose, 'ACCOUNT_ACTIVATION');
    } finally { phoneGuard.isPhoneRegistered = origReg; otpHelper.createAndSendOTP = origOtp; }
  });

  await t.test('OTP_SEND_BLOCKED:5 → exact 429', async () => {
    const origReg = phoneGuard.isPhoneRegistered;
    const origOtp = otpHelper.createAndSendOTP;
    phoneGuard.isPhoneRegistered = async () => ({ registered: false });
    otpHelper.createAndSendOTP = async () => { throw new Error('OTP_SEND_BLOCKED:5'); };
    try {
      const res = await send({ phone: '9800001050', purpose: 'REGISTRATION' });
      assert.equal(res.status, 429);
      assert.deepEqual(res.body, { success: false, message: 'Too many OTP requests. Please wait 5 minute(s) before trying again.', errorCode: 'OTP_SEND_BLOCKED', retryAfterMinutes: 5 });
    } finally { phoneGuard.isPhoneRegistered = origReg; otpHelper.createAndSendOTP = origOtp; }
  });

  await t.test('OTP_SEND_BLOCKED malformed → fallback 10 minutes', async () => {
    const origReg = phoneGuard.isPhoneRegistered;
    const origOtp = otpHelper.createAndSendOTP;
    phoneGuard.isPhoneRegistered = async () => ({ registered: false });
    otpHelper.createAndSendOTP = async () => { throw new Error('OTP_SEND_BLOCKED:'); };
    try {
      const res = await send({ phone: '9800001051', purpose: 'REGISTRATION' });
      assert.equal(res.status, 429);
      assert.equal(res.body.retryAfterMinutes, 10);
    } finally { phoneGuard.isPhoneRegistered = origReg; otpHelper.createAndSendOTP = origOtp; }
  });

  await t.test('unknown failure → exact 500, no internal field', async () => {
    const origReg = phoneGuard.isPhoneRegistered;
    const origOtp = otpHelper.createAndSendOTP;
    phoneGuard.isPhoneRegistered = async () => ({ registered: false });
    otpHelper.createAndSendOTP = async () => { throw new Error('DB exploded'); };
    try {
      const res = await send({ phone: '9800001060', purpose: 'REGISTRATION' });
      assert.equal(res.status, 500);
      assert.deepEqual(res.body, { success: false, message: 'Failed to resend OTP. Please try again.' });
    } finally { phoneGuard.isPhoneRegistered = origReg; otpHelper.createAndSendOTP = origOtp; }
  });
});
