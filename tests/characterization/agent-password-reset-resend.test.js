'use strict';

process.env.SECRET_KEY ||= 'test-only-secret-32chars-minimum!!';

const test = require('node:test');
const assert = require('node:assert/strict');
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
const phone = (n) => `98183${String(n).padStart(5, '0')}`;
const user = (p, fields = {}) => User.create({
  name: 'Reset Resend',
  phone: p,
  password: bcrypt.hashSync('AgentPass123!', 10),
  role: 'agent',
  roles: ['agent'],
  status: 'active',
  ...fields,
});

test('agent password reset resend characterization', async (t) => {
  t.before(async () => db.connect());
  t.after(async () => db.disconnect());
  t.beforeEach(async () => db.clearAll());

  await t.test('missing user and non-agent preserve neutral responses without OTP', async () => {
    const calls = [];
    const restore = patch(otpHelper, 'createAndSendOTP', async (p) => calls.push(p));
    try {
      let res = await request(app).post('/api/auth/agent/resendOtpForReset').send({});
      assert.equal(res.status, 400);
      assert.deepEqual(res.body, { success: false, message: 'Phone number is required.' });
      res = await request(app).post('/api/auth/agent/resendOtpForReset').send({ phone: phone(1) });
      assert.equal(res.status, 200);
      await user(phone(2), { role: 'passenger', roles: ['passenger'] });
      res = await request(app).post('/api/auth/agent/resendOtpForReset').send({ phone: phone(2) });
      assert.equal(res.status, 200);
      assert.deepEqual(calls, []);
    } finally { restore(); }
  });

  await t.test('banned/inactive agents stay neutral and receive no OTP', async () => {
    const calls = [];
    const restore = patch(otpHelper, 'createAndSendOTP', async (p) => calls.push(p));
    try {
    for (const status of ['banned', 'inactive']) {
      const p = status === 'banned' ? phone(3) : phone(4);
      await user(p, { status });
      const res = await request(app).post('/api/auth/agent/resendOtpForReset').send({ phone: p });
      assert.equal(res.status, 200);
      assert.equal(res.body.message, 'If an account exists, a new code has been sent.');
    }
    assert.deepEqual(calls, []);
    } finally { restore(); }
  });

  await t.test('eligible agent receives the OTP without changing the neutral response', async () => {
    const calls = [];
    const restore = patch(otpHelper, 'createAndSendOTP', async (p, purpose) => {
      calls.push([p, purpose]);
      return { expiresIn: '5 minutes' };
    });
    try {
      await user(phone(5));
      const res = await request(app).post('/api/auth/agent/resendOtpForReset').send({ phone: phone(5) });
      assert.equal(res.status, 200);
      assert.deepEqual(res.body, {
        success: true,
        message: 'If an account exists, a new code has been sent.',
      });
      assert.deepEqual(calls, [[phone(5), 'AGENT_PASSWORD_RESET']]);
    } finally { restore(); }
  });

  await t.test('OTP_SEND_BLOCKED and generic failure map exactly', async () => {
    let mode = 'blocked';
    const restore = patch(otpHelper, 'createAndSendOTP', async () => {
      throw new Error(mode === 'blocked' ? 'OTP_SEND_BLOCKED:9' : 'boom');
    });
    try {
      await user(phone(6));
      let res = await request(app).post('/api/auth/agent/resendOtpForReset').send({ phone: phone(6) });
      assert.equal(res.status, 429);
      assert.equal(res.body.retryAfterMinutes, 9);
      mode = 'boom';
      res = await request(app).post('/api/auth/agent/resendOtpForReset').send({ phone: phone(6) });
      assert.equal(res.status, 500);
      assert.deepEqual(res.body, { success: false, message: 'Failed to resend code. Please try again.' });
    } finally { restore(); }
  });
});
