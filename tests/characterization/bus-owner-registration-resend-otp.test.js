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
const phone = () => `98755${String(++n).padStart(5, '0')}`;
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
const post = (body) => request(app).post('/api/auth/busowner/resendOTP').send(body);

test('bus-owner registration resendOTP characterization', async (t) => {
  t.before(async () => db.connect());
  t.after(async () => db.disconnect());
  t.beforeEach(async () => db.clearAll());

  await t.test('missing phone, no parsed body, and existing owner responses are exact', async () => {
    const missing = await post({});
    assert.equal(missing.status, 400);
    assert.deepEqual(missing.body, { success: false, message: 'Phone number is required.' });
    const noBody = await request(app)
      .post('/api/auth/busowner/resendOTP')
      .set('Content-Type', 'application/json')
      .send('');
    assert.equal(noBody.status, 400);
    assert.deepEqual(noBody.body, {
      success: false,
      message: 'Phone number is required.',
    });
    const p = phone();
    await user({ name: 'Owner', phone: p, role: 'busOwner', roles: ['busOwner'] });
    const res = await post({ phone: p });
    assert.equal(res.status, 409);
    assert.deepEqual(res.body, {
      success: false,
      message: 'This mobile number is already registered as a bus operator.',
      errorCode: 'ROLE_ALREADY_REGISTERED',
    });
  });

  await t.test('new and non-owner phones resend without Nepal regex validation', async () => {
    const calls = [];
    const restore = patchSend(async (...args) => {
      calls.push(args);
      return { expiresIn: 123 };
    });
    try {
      const nonOwner = phone();
      const unusual = '12345';
      await user({ name: 'Passenger', phone: nonOwner, role: 'passenger', roles: ['passenger'] });
      for (const p of [nonOwner, unusual]) {
        const res = await post({ phone: p });
        assert.equal(res.status, 200);
        assert.deepEqual(res.body, {
          success: true,
          message: 'New verification code sent.',
          data: { expiresIn: 123 },
        });
      }
      assert.deepEqual(calls, [
        [nonOwner, 'BUSOWNER_REGISTRATION'],
        [unusual, 'BUSOWNER_REGISTRATION'],
      ]);
    } finally { restore(); }
  });

  await t.test('OTP_SEND_BLOCKED and generic failures map exactly', async () => {
    let restore = patchSend(async () => { throw new Error('OTP_SEND_BLOCKED:9'); });
    try {
      const res = await post({ phone: phone() });
      assert.equal(res.status, 429);
      assert.equal(res.body.retryAfterMinutes, 9);
      assert.equal(res.body.errorCode, 'OTP_SEND_BLOCKED');
    } finally { restore(); }
    restore = patchSend(async () => { throw new Error('boom'); });
    try {
      const res = await post({ phone: phone() });
      assert.equal(res.status, 500);
      assert.deepEqual(res.body, {
        success: false,
        message: 'Failed to resend code. Please try again.',
      });
    } finally { restore(); }
  });
});
