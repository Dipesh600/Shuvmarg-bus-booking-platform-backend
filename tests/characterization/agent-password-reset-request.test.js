'use strict';

process.env.SECRET_KEY ||= 'test-only-secret-32chars-minimum!!';
process.env.VERIFICATION_TOKEN_SECRET ||= 'test-only-verification-secret!!';

const test = require('node:test');
const assert = require('node:assert/strict');
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
const phone = (n) => `98180${String(n).padStart(5, '0')}`;
const user = (p, fields = {}) => User.create({
  name: 'Reset Agent',
  phone: p,
  password: bcrypt.hashSync('AgentPass123!', 10),
  role: 'agent',
  roles: ['agent'],
  status: 'active',
  ...fields,
});

test('agent password reset request characterization', async (t) => {
  t.before(async () => db.connect());
  t.after(async () => db.disconnect());
  t.beforeEach(async () => db.clearAll());

  await t.test('missing phone and missing account preserve exact responses', async () => {
    let res = await request(app).post('/api/auth/agent/requestPasswordReset').send({});
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { success: false, message: 'Phone number is required.' });
    res = await request(app).post('/api/auth/agent/requestPasswordReset').send({ phone: phone(1) });
    assert.equal(res.status, 404);
    assert.equal(res.body.success, false);
    assert.equal(res.body.code, 'ACCOUNT_NOT_FOUND');
    assert.equal(res.body.message, 'No agent account found with this phone number.');
  });

  await t.test('normalizes phone and sends only eligible agent OTP with latency wrapper', async () => {
    const calls = [];
    const restores = [
      patch(enumGuard, 'withMinimumLatency', async (fn, ms) => { calls.push(`latency:${ms}`); return fn(); }),
      patch(otpHelper, 'createAndSendOTP', async (p, purpose) => calls.push(`otp:${p}:${purpose}`)),
    ];
    try {
      const p = phone(2);
      await user(p);
      const res = await request(app)
        .post('/api/auth/agent/requestPasswordReset')
        .send({ phone: `+977-${p}` });
      assert.equal(res.status, 200);
      assert.deepEqual(calls, [`latency:600`, `otp:${p}:AGENT_PASSWORD_RESET`]);
    } finally { restores.reverse().forEach((fn) => fn()); }
  });

  await t.test('non-agent and banned/inactive agents preserve anti-enumeration behavior', async () => {
    const calls = [];
    const restore = patch(otpHelper, 'createAndSendOTP', async (p) => calls.push(p));
    try {
      await user(phone(3), { role: 'passenger', roles: ['passenger'] });
      await user(phone(4), { status: 'banned' });
      await user(phone(5), { status: 'inactive' });
      for (const p of [phone(3), phone(4), phone(5)]) {
        const res = await request(app).post('/api/auth/agent/requestPasswordReset').send({ phone: p });
        assert.equal(res.status, p === phone(3) ? 404 : 200);
      }
      assert.deepEqual(calls, [phone(4), phone(5)]);
    } finally { restore(); }
  });

  await t.test('OTP_SEND_BLOCKED and generic failure map exactly', async () => {
    let mode = 'blocked';
    const restore = patch(otpHelper, 'createAndSendOTP', async () => {
      throw new Error(mode === 'blocked' ? 'OTP_SEND_BLOCKED:8' : 'boom');
    });
    try {
      await user(phone(6));
      let res = await request(app).post('/api/auth/agent/requestPasswordReset').send({ phone: phone(6) });
      assert.equal(res.status, 429);
      assert.equal(res.body.retryAfterMinutes, 8);
      assert.equal(res.body.errorCode, 'OTP_SEND_BLOCKED');
      mode = 'boom';
      res = await request(app).post('/api/auth/agent/requestPasswordReset').send({ phone: phone(6) });
      assert.equal(res.status, 500);
      assert.deepEqual(res.body, { success: false, message: 'Failed to send OTP. Please try again.' });
    } finally { restore(); }
  });
});
