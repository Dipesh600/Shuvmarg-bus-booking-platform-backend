'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const db = require('../helpers/db');
const app = require('../helpers/app');
const User = require('../../models/userModel');
const OTP = require('../../models/otpModel');

// Stub Sparrow SMS so no real HTTP calls are made
const sparro = require('../../handlers/sparro-otp');
const _originalSend = sparro;

test('Auth Registration: sendPhoneOTP', async (t) => {
  t.before(async () => await db.connect());
  t.after(async () => await db.disconnect());
  t.beforeEach(async () => await db.clearAll());

  await t.test('POST /api/sendPhoneOTP - missing phone → 400 from middleware', async () => {
    const res = await request(app).post('/api/sendPhoneOTP').send({});
    assert.equal(res.status, 400);
    assert.ok(res.body.message);
  });

  await t.test('POST /api/sendPhoneOTP - already-registered phone → generic 200, no data field', async () => {
    await User.create({
      phone: '9800000001', name: 'Existing', address: 'KTM', gender: 'male',
      password: 'hashedpwd!!!', phoneVerified: true, isVerified: true, roles: ['passenger'],
      referralCode: 'SHUV-EXI01',
    });


    // Stub SMS to prevent real network call
    const otpHelper = require('../../utils/otpHelper');
    const orig = otpHelper.createAndSendOTP;
    otpHelper.createAndSendOTP = async () => ({ success: true, expiresIn: '5 minutes' });

    const res = await request(app).post('/api/sendPhoneOTP').send({ phone: '9800000001' });
    otpHelper.createAndSendOTP = orig;

    assert.equal(res.status, 200);
    assert.equal(res.body.status, true);
    assert.ok(res.body.message.includes('eligible'));
    assert.equal(res.body.data, undefined); // no data — enumeration defence
  });

  await t.test('POST /api/sendPhoneOTP - OTP_SEND_BLOCKED → 429', async () => {
    // Seed a blocked OTP record
    await OTP.create({
      phone: '9800000002', purpose: 'REGISTRATION',
      otp: 'hash', otpExpiry: new Date(Date.now() + 300000),
      blockedUntil: new Date(Date.now() + 600000), sendCount: 3,
    });

    const res = await request(app).post('/api/sendPhoneOTP').send({ phone: '9800000002' });
    assert.equal(res.status, 429);
    assert.equal(res.body.success, false);
    assert.equal(res.body.errorCode, 'OTP_SEND_BLOCKED');
    assert.ok(typeof res.body.retryAfterMinutes === 'number');
  });

  await t.test('POST /api/sendPhoneOTP - new phone, OTP sent → 200 with expiresIn', async () => {
    const otpHelper = require('../../utils/otpHelper');
    const orig = otpHelper.createAndSendOTP;
    otpHelper.createAndSendOTP = async () => ({ success: true, expiresIn: '5 minutes' });

    const res = await request(app).post('/api/sendPhoneOTP').send({ phone: '9800009999' });
    otpHelper.createAndSendOTP = orig;

    assert.equal(res.status, 200);
    assert.equal(res.body.status, true);
    assert.equal(res.body.data.expiresIn, '5 minutes');
  });
});
