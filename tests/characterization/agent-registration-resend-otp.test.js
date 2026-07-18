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
const phone = (n) => `98175${String(n).padStart(5, '0')}`;

test('Agent registration resendOTP characterization', async (t) => {
  t.before(async () => db.connect());
  t.after(async () => db.disconnect());
  t.beforeEach(async () => db.clearAll());

  await t.test('missing phone and existing agent preserve exact responses', async () => {
    let res = await request(app).post('/api/auth/agent/resendOTP').send({});
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { success: false, message: 'Phone number is required.' });
    const p = phone(1);
    await User.create({
      name: 'Agent',
      phone: p,
      password: bcrypt.hashSync('AgentPass123!', 10),
      role: 'agent',
      roles: ['agent'],
    });
    res = await request(app).post('/api/auth/agent/resendOTP').send({ phone: p });
    assert.equal(res.status, 409);
    assert.deepEqual(res.body, {
      success: false,
      message: 'This mobile number is already registered as an agent.',
      errorCode: 'ROLE_ALREADY_REGISTERED',
    });
  });

  await t.test('successful resend uses AGENT_REGISTRATION and returns expiresIn', async () => {
    let captured;
    const restore = patch(otpHelper, 'createAndSendOTP', async (p, purpose) => {
      captured = [p, purpose];
      return { expiresIn: '5 minutes' };
    });
    try {
      const p = phone(2);
      const res = await request(app).post('/api/auth/agent/resendOTP').send({ phone: p });
      assert.equal(res.status, 200);
      assert.deepEqual(captured, [p, 'AGENT_REGISTRATION']);
      assert.deepEqual(res.body, {
        success: true,
        message: 'New verification code sent.',
        data: { expiresIn: '5 minutes' },
      });
    } finally { restore(); }
  });

  await t.test('OTP_SEND_BLOCKED and generic failures preserve exact mappings', async () => {
    let mode = 'blocked';
    const restore = patch(otpHelper, 'createAndSendOTP', async () => {
      if (mode === 'blocked') throw new Error('OTP_SEND_BLOCKED:9');
      throw new Error('boom');
    });
    try {
      let res = await request(app).post('/api/auth/agent/resendOTP').send({ phone: phone(3) });
      assert.equal(res.status, 429);
      assert.equal(res.body.errorCode, 'OTP_SEND_BLOCKED');
      assert.equal(res.body.retryAfterMinutes, 9);
      mode = 'boom';
      res = await request(app).post('/api/auth/agent/resendOTP').send({ phone: phone(4) });
      assert.equal(res.status, 500);
      assert.deepEqual(res.body, {
        success: false,
        message: 'Failed to resend code. Please try again.',
      });
    } finally { restore(); }
  });
});
