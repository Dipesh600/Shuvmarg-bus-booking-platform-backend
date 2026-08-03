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
const enumGuard = require('../../utils/enumGuard');

const patch = (obj, key, fn) => {
  const old = obj[key];
  obj[key] = fn;
  return () => { obj[key] = old; };
};
const phone = (n) => `98200${String(n).padStart(5, '0')}`;
const credential = () => `${crypto.randomBytes(24).toString('hex')}A1`;
const user = (p, fields = {}) => User.create({
  name: 'Bus Reset',
  phone: p,
  password: bcrypt.hashSync(credential(), 10),
  role: 'busOwner',
  roles: ['busOwner'],
  status: 'active',
  ...fields,
});
const post = (body) => request(app).post('/api/auth/busowner/requestPasswordReset').send(body);

test('bus-owner password reset request characterization', async (t) => {
  t.before(async () => db.connect());
  t.after(async () => db.disconnect());
  t.beforeEach(async () => db.clearAll());

  await t.test('missing, no parsed body, missing user and wrong role responses', async () => {
    let res = await post({});
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { success: false, message: 'Phone number is required.' });
    res = await request(app).post('/api/auth/busowner/requestPasswordReset')
      .set('Content-Type', 'text/plain').send('not-json');
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { success: false, message: 'Phone number is required.' });
    res = await post({ phone: phone(1) });
    assert.equal(res.status, 404);
    assert.equal(res.body.success, false);
    assert.equal(res.body.code, 'ACCOUNT_NOT_FOUND');
    assert.equal(res.body.message, 'No bus owner account found with this phone number.');
    await user(phone(2), { role: 'passenger', roles: ['passenger'] });
    res = await post({ phone: phone(2) });
    assert.equal(res.status, 404);
    assert.equal(res.body.success, false);
    assert.equal(res.body.code, 'ACCOUNT_NOT_FOUND');
    assert.equal(res.body.message, 'No bus owner account found with this phone number.');
  });

  await t.test('eligible and suspended bus owners send stored-phone OTP with latency', async () => {
    const calls = [];
    const restores = [
      patch(enumGuard, 'withMinimumLatency', async (fn, ms) => { calls.push(`latency:${ms}`); return fn(); }),
      patch(otpHelper, 'createAndSendOTP', async (p, purpose) => calls.push(`otp:${p}:${purpose}`)),
    ];
    try {
      await user(phone(3));
      await user(phone(4), { status: 'banned' });
      await user(phone(5), { status: 'inactive' });
      for (const p of [phone(3), phone(4), phone(5)]) {
        const res = await post({ phone: `+977-${p}` });
        assert.equal(res.status, 200);
      }
      assert.deepEqual(calls, [
        'latency:600', `otp:${phone(3)}:BUSOWNER_PASSWORD_RESET`,
        'latency:600', `otp:${phone(4)}:BUSOWNER_PASSWORD_RESET`,
        'latency:600', `otp:${phone(5)}:BUSOWNER_PASSWORD_RESET`,
      ]);
    } finally { restores.reverse().forEach((fn) => fn()); }
  });

  await t.test('OTP_SEND_BLOCKED, Sparrow SMS and generic errors map exactly', async () => {
    let mode = 'blocked';
    const restore = patch(otpHelper, 'createAndSendOTP', async () => {
      if (mode === 'blocked') throw new Error('OTP_SEND_BLOCKED:7');
      if (mode === 'sparrow') throw new Error('Sparrow SMS down');
      throw new Error('boom');
    });
    try {
      await user(phone(6));
      let res = await post({ phone: phone(6) });
      assert.equal(res.status, 429);
      assert.equal(res.body.retryAfterMinutes, 7);
      mode = 'sparrow';
      res = await post({ phone: phone(6) });
      assert.equal(res.status, 502);
      assert.deepEqual(res.body, { success: false, message: 'SMS gateway error. Please try again.' });
      mode = 'boom';
      res = await post({ phone: phone(6) });
      assert.equal(res.status, 500);
      assert.deepEqual(res.body, { success: false, message: 'Failed to send OTP. Please try again.' });
    } finally { restore(); }
  });
});
