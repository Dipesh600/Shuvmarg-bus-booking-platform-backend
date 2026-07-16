'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const db = require('../helpers/db');
const app = require('../helpers/app');
const User = require('../../models/userModel');
const OTP = require('../../models/otpModel');

const patchMethod = (obj, key, fn) => {
  const orig = obj[key];
  obj[key] = fn;
  return () => { obj[key] = orig; };
};

test('Auth Registration: sendPhoneOTP', async (t) => {
  t.before(async () => await db.connect());
  t.after(async () => await db.disconnect());
  t.beforeEach(async () => await db.clearAll());

  await t.test('missing phone → 400 exact body', async () => {
    const res = await request(app).post('/api/sendPhoneOTP').send({});
    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.message, 'Phone number is required.');
  });

  await t.test('registered phone → exact generic 200, no data field', async () => {
    await User.create({
      phone: '9800000001', name: 'Existing', address: 'KTM', gender: 'male',
      password: 'hashedpwd!!!', phoneVerified: true, isVerified: true, roles: ['passenger'],
      referralCode: 'SHUV-EXI01',
    });
    const otpHelper = require('../../utils/otpHelper');
    let sendCalled = false;
    const restore = patchMethod(otpHelper, 'createAndSendOTP', async () => { sendCalled = true; });
    try {
      const res = await request(app).post('/api/sendPhoneOTP').send({ phone: '9800000001' });
      assert.equal(res.status, 200);
      assert.equal(res.body.status, true);
      assert.match(res.body.message, /eligible/);
      assert.equal(res.body.data, undefined);
      assert.equal(sendCalled, false);
    } finally { restore(); }
  });

  await t.test('OTP_SEND_BLOCKED → 429 exact body', async () => {
    await OTP.create({
      phone: '9800000002', purpose: 'REGISTRATION',
      otp: 'hash', otpExpiry: new Date(Date.now() + 300000),
      blockedUntil: new Date(Date.now() + 600000), sendCount: 3,
    });
    const res = await request(app).post('/api/sendPhoneOTP').send({ phone: '9800000002' });
    assert.equal(res.status, 429);
    assert.equal(res.body.success, false);
    assert.ok(res.body.message.includes('Too many OTP requests'));
    assert.equal(res.body.errorCode, 'OTP_SEND_BLOCKED');
    assert.ok(typeof res.body.retryAfterMinutes === 'number');
  });

  await t.test('unregistered phone → purpose REGISTRATION passed to createAndSendOTP', async () => {
    const otpHelper = require('../../utils/otpHelper');
    let capturedPurpose;
    const restore = patchMethod(otpHelper, 'createAndSendOTP',
      async (_phone, purpose) => { capturedPurpose = purpose; return { expiresIn: '5 minutes' }; }
    );
    try {
      await request(app).post('/api/sendPhoneOTP').send({ phone: '9800009990' });
      assert.equal(capturedPurpose, 'REGISTRATION');
    } finally { restore(); }
  });

  await t.test('new phone, OTP sent → 200 with expiresIn in data', async () => {
    const otpHelper = require('../../utils/otpHelper');
    const restore = patchMethod(otpHelper, 'createAndSendOTP',
      async () => ({ success: true, expiresIn: '5 minutes' })
    );
    try {
      const res = await request(app).post('/api/sendPhoneOTP').send({ phone: '9800009999' });
      assert.equal(res.status, 200);
      assert.equal(res.body.status, true);
      assert.equal(res.body.data.expiresIn, '5 minutes');
    } finally { restore(); }
  });

  await t.test('unexpected failure → exact legacy 500 body', async () => {
    const otpHelper = require('../../utils/otpHelper');
    const restore = patchMethod(otpHelper, 'createAndSendOTP',
      async () => { throw new Error('crash'); }
    );
    try {
      const res = await request(app).post('/api/sendPhoneOTP').send({ phone: '9800009998' });
      assert.equal(res.status, 500);
      assert.equal(res.body.status, false);
      assert.equal(res.body.message, 'Failed to send OTP. Please try again.');
    } finally { restore(); }
  });
});
