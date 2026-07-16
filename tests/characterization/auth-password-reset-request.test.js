'use strict';

require('../helpers/app');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../helpers/app');
const db = require('../helpers/db');
const User = require('../../models/userModel');
const OTP = require('../../models/otpModel');
const crypto = require('crypto');

const HASHED_PW = '$2a$12$aaaaaaaaaaaaaaaaaaaaaa.BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';

const seedUser = async (phone) =>
  User.create({ name: 'Reset Tester', phone, password: HASHED_PW, role: 'passenger', roles: ['passenger'], isVerified: true, deletedAt: null });

test('Auth: requestPasswordReset', async (t) => {
  await db.connect();
  t.after(() => db.disconnect());
  t.beforeEach(() => db.clearAll());

  await t.test('unknown account → exact generic 200', async () => {
    const otpHelper = require('../../utils/otpHelper');
    const orig = otpHelper.createAndSendOTP;
    otpHelper.createAndSendOTP = async () => { throw new Error('should not be called'); };
    try {
      const res = await request(app).post('/api/requestPasswordReset').send({ emailOrPhone: '9800000099' });
      assert.equal(res.status, 200);
      assert.equal(res.body.status, true);
      assert.equal(res.body.message, 'If an account exists, OTP has been sent.');
    } finally { otpHelper.createAndSendOTP = orig; }
  });

  await t.test('unknown account → OTP helper NOT called', async () => {
    const otpHelper = require('../../utils/otpHelper');
    const orig = otpHelper.createAndSendOTP;
    let called = false;
    otpHelper.createAndSendOTP = async () => { called = true; return { expiresIn: 300 }; };
    try {
      await request(app).post('/api/requestPasswordReset').send({ emailOrPhone: '9800000098' });
      assert.equal(called, false);
    } finally { otpHelper.createAndSendOTP = orig; }
  });

  await t.test('existing phone → exact generic 200', async () => {
    await seedUser('9800000091');
    const otpHelper = require('../../utils/otpHelper');
    const orig = otpHelper.createAndSendOTP;
    otpHelper.createAndSendOTP = async () => ({ expiresIn: 300 });
    try {
      const res = await request(app).post('/api/requestPasswordReset').send({ emailOrPhone: '9800000091' });
      assert.equal(res.status, 200); assert.equal(res.body.status, true);
    } finally { otpHelper.createAndSendOTP = orig; }
  });

  await t.test('existing email → exact generic 200', async () => {
    const u = await seedUser('9800000092');
    u.email = 'reset92@test.com'; await u.save();
    const otpHelper = require('../../utils/otpHelper');
    const orig = otpHelper.createAndSendOTP;
    otpHelper.createAndSendOTP = async () => ({ expiresIn: 300 });
    try {
      const res = await request(app).post('/api/requestPasswordReset').send({ emailOrPhone: 'reset92@test.com' });
      assert.equal(res.status, 200); assert.equal(res.body.status, true);
    } finally { otpHelper.createAndSendOTP = orig; }
  });

  await t.test('OTP sent to user.phone, purpose PASSWORD_RESET', async () => {
    await seedUser('9800000093');
    const otpHelper = require('../../utils/otpHelper');
    const orig = otpHelper.createAndSendOTP;
    let capturedPhone, capturedPurpose;
    otpHelper.createAndSendOTP = async (p, pur) => { capturedPhone = p; capturedPurpose = pur; return { expiresIn: 300 }; };
    try {
      await request(app).post('/api/requestPasswordReset').send({ emailOrPhone: '9800000093' });
      assert.equal(capturedPhone, '9800000093');
      assert.equal(capturedPurpose, 'PASSWORD_RESET');
    } finally { otpHelper.createAndSendOTP = orig; }
  });

  await t.test('OTP_SEND_BLOCKED → exact 429 contract', async () => {
    await seedUser('9800000094');
    const otpHelper = require('../../utils/otpHelper');
    const orig = otpHelper.createAndSendOTP;
    otpHelper.createAndSendOTP = async () => { throw new Error('OTP_SEND_BLOCKED:5'); };
    try {
      const res = await request(app).post('/api/requestPasswordReset').send({ emailOrPhone: '9800000094' });
      assert.equal(res.status, 429); assert.equal(res.body.success, false);
      assert.equal(res.body.errorCode, 'OTP_SEND_BLOCKED'); assert.equal(res.body.retryAfterMinutes, 5);
    } finally { otpHelper.createAndSendOTP = orig; }
  });

  await t.test('Sparrow SMS error → exact 502 contract', async () => {
    await seedUser('9800000095');
    const otpHelper = require('../../utils/otpHelper');
    const orig = otpHelper.createAndSendOTP;
    otpHelper.createAndSendOTP = async () => { throw new Error('Sparrow SMS gateway timeout'); };
    try {
      const res = await request(app).post('/api/requestPasswordReset').send({ emailOrPhone: '9800000095' });
      assert.equal(res.status, 502); assert.equal(res.body.status, false);
      assert.equal(res.body.message, 'SMS gateway error. Please try again.');
    } finally { otpHelper.createAndSendOTP = orig; }
  });

  await t.test('unknown failure → exact 500 contract', async () => {
    await seedUser('9800000096');
    const otpHelper = require('../../utils/otpHelper');
    const orig = otpHelper.createAndSendOTP;
    otpHelper.createAndSendOTP = async () => { throw new Error('DB exploded'); };
    try {
      const res = await request(app).post('/api/requestPasswordReset').send({ emailOrPhone: '9800000096' });
      assert.equal(res.status, 500); assert.equal(res.body.status, false);
      assert.equal(res.body.message, 'Failed to send OTP. Please try again.');
    } finally { otpHelper.createAndSendOTP = orig; }
  });
});
