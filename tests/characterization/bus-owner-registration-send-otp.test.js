'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const request = require('supertest');
const bcrypt = require('bcryptjs');

const db = require('../helpers/db');
const app = require('../helpers/app');
const User = require('../../models/userModel');
const otpHelper = require('../../utils/otpHelper');

let n = 0;
const phone = () => `98155${String(++n).padStart(5, '0')}`;
const credential = () => `${crypto.randomBytes(24).toString('hex')}A1`;
const user = async (fields) => User.create({
  password: await bcrypt.hash(credential(), 10),
  ...fields,
});
const patchSend = (fn) => {
  const orig = otpHelper.createAndSendOTP;
  otpHelper.createAndSendOTP = fn;
  return () => { otpHelper.createAndSendOTP = orig; };
};
const post = (body) => request(app).post('/api/auth/busowner/sendOTP').send(body);

test('bus-owner registration sendOTP characterization', async (t) => {
  t.before(async () => db.connect());
  t.after(async () => db.disconnect());
  t.beforeEach(async () => db.clearAll());

  await t.test('missing, invalid and no parsed body responses are exact', async () => {
    const missing = await post({});
    assert.equal(missing.status, 400);
    assert.deepEqual(missing.body, { success: false, message: 'Phone number is required.' });
    const invalid = await post({ phone: '9612345678' });
    assert.equal(invalid.status, 400);
    assert.deepEqual(invalid.body, {
      success: false,
      message: 'Please enter a valid Nepal mobile number.',
    });
    const noBody = await request(app)
      .post('/api/auth/busowner/sendOTP')
      .set('Content-Type', 'application/json')
      .send('');
    assert.equal(noBody.status, 400);
    assert.deepEqual(noBody.body, {
      success: false,
      message: 'Phone number is required.',
    });
  });

  await t.test('eligible and ineligible states preserve neutral response and OTP side effects', async () => {
    const calls = [];
    const restore = patchSend(async (...args) => {
      calls.push(args);
      return { expiresIn: 300 };
    });
    try {
      const newPhone = phone();
      const nonOwnerPhone = phone();
      const ownerPhone = phone();
      const bannedPhone = phone();
      await user({ name: 'Passenger', phone: nonOwnerPhone, role: 'passenger', roles: ['passenger'] });
      await user({ name: 'Owner', phone: ownerPhone, role: 'busOwner', roles: ['busOwner'] });
      await user({ name: 'Banned', phone: bannedPhone, role: 'passenger', roles: ['passenger'], status: 'banned' });
      for (const p of [newPhone, nonOwnerPhone, ownerPhone, bannedPhone]) {
        const res = await post({ phone: p });
        assert.equal(res.status, 200);
        assert.deepEqual(res.body, {
          success: true,
          message: 'If this number is eligible, a verification code has been sent.',
        });
      }
      assert.deepEqual(calls, [
        [newPhone, 'BUSOWNER_REGISTRATION'],
        [nonOwnerPhone, 'BUSOWNER_REGISTRATION'],
      ]);
    } finally { restore(); }
  });

  await t.test('OTP_SEND_BLOCKED and generic failures map exactly', async () => {
    let restore = patchSend(async () => { throw new Error('OTP_SEND_BLOCKED:7'); });
    try {
      const res = await post({ phone: phone() });
      assert.equal(res.status, 429);
      assert.deepEqual(res.body, {
        success: false,
        message: 'Too many OTP requests. Please wait 7 minute(s) before trying again.',
        errorCode: 'OTP_SEND_BLOCKED',
        retryAfterMinutes: 7,
      });
    } finally { restore(); }
    restore = patchSend(async () => { throw new Error('OTP_SEND_BLOCKED:0'); });
    try {
      const res = await post({ phone: phone() });
      assert.equal(res.body.retryAfterMinutes, 10);
    } finally { restore(); }
    restore = patchSend(async () => { throw new Error('boom'); });
    try {
      const res = await post({ phone: phone() });
      assert.equal(res.status, 500);
      assert.deepEqual(res.body, {
        success: false,
        message: 'Failed to send verification code. Please try again.',
      });
    } finally { restore(); }
  });
});
