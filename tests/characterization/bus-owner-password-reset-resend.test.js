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

const patch = (obj, key, fn) => {
  const old = obj[key];
  obj[key] = fn;
  return () => { obj[key] = old; };
};
const phone = (n) => `98220${String(n).padStart(5, '0')}`;
const credential = () => `${crypto.randomBytes(24).toString('hex')}A1`;
const user = (p, fields = {}) => User.create({
  name: 'Bus Resend',
  phone: p,
  password: bcrypt.hashSync(credential(), 10),
  role: 'busOwner',
  roles: ['busOwner'],
  status: 'active',
  ...fields,
});
const post = (body) => request(app).post('/api/auth/busowner/resendOtpForReset').send(body);

test('bus-owner password reset resend characterization', async (t) => {
  t.before(async () => db.connect());
  t.after(async () => db.disconnect());
  t.beforeEach(async () => db.clearAll());

  await t.test('missing, no parsed body, missing user and wrong role responses', async () => {
    let res = await post({});
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { success: false, message: 'Phone number is required.' });
    res = await request(app).post('/api/auth/busowner/resendOtpForReset')
      .set('Content-Type', 'text/plain').send('x');
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { success: false, message: 'Phone number is required.' });
    res = await post({ phone: phone(1) });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { success: true, message: 'If an account exists, a new code has been sent.' });
    await user(phone(2), { role: 'passenger', roles: ['passenger'] });
    res = await post({ phone: phone(2) });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { success: true, message: 'If an account exists, a new code has been sent.' });
  });

  await t.test('suspended owners disclose suspension only after role check', async () => {
    for (const [i, status] of [[3, 'banned'], [4, 'inactive']]) {
      await user(phone(i), { status });
      const res = await post({ phone: phone(i) });
      assert.equal(res.status, 403);
      assert.deepEqual(res.body, {
        success: false,
        message: 'This account has been suspended. Please contact support.',
        errorCode: 'ACCOUNT_SUSPENDED',
      });
    }
  });

  await t.test('eligible user receives normalized-phone OTP, purpose and expiresIn', async () => {
    const calls = [];
    const restore = patch(otpHelper, 'createAndSendOTP', async (p, purpose) => {
      calls.push([p, purpose]);
      return { expiresIn: 300 };
    });
    try {
      const p = phone(5);
      await user(p);
      const res = await post({ phone: `+977-${p}` });
      assert.equal(res.status, 200);
      assert.deepEqual(res.body, {
        success: true,
        message: 'New verification code sent.',
        data: { expiresIn: 300 },
      });
      assert.deepEqual(calls, [[p, 'BUSOWNER_PASSWORD_RESET']]);
    } finally { restore(); }
  });

  await t.test('OTP_SEND_BLOCKED and generic errors map exactly', async () => {
    let mode = 'blocked';
    const restore = patch(otpHelper, 'createAndSendOTP', async () => {
      if (mode === 'blocked') throw new Error('OTP_SEND_BLOCKED:0');
      throw new Error('boom');
    });
    try {
      await user(phone(6));
      let res = await post({ phone: phone(6) });
      assert.equal(res.status, 429);
      assert.equal(res.body.retryAfterMinutes, 10);
      mode = 'boom';
      res = await post({ phone: phone(6) });
      assert.equal(res.status, 500);
      assert.deepEqual(res.body, { success: false, message: 'Failed to resend code. Please try again.' });
    } finally { restore(); }
  });
});
