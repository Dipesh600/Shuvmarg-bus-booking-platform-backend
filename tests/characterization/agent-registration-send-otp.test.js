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
const Agent = require('../../models/agentModel');
const otpHelper = require('../../utils/otpHelper');

const patch = (obj, key, fn) => {
  const old = obj[key];
  obj[key] = fn;
  return () => { obj[key] = old; };
};
const phone = (n) => `98170${String(n).padStart(5, '0')}`;
const user = (p, fields = {}) => User.create({
  name: 'Agent OTP',
  phone: p,
  password: bcrypt.hashSync('AgentPass123!', 10),
  role: 'passenger',
  roles: ['passenger'],
  status: 'active',
  ...fields,
});

test('Agent registration sendOTP characterization', async (t) => {
  t.before(async () => db.connect());
  t.after(async () => db.disconnect());
  t.beforeEach(async () => db.clearAll());

  await t.test('missing and invalid phone preserve exact responses', async () => {
    let res = await request(app).post('/api/auth/agent/sendOTP').send({});
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { success: false, message: 'Phone number is required.' });
    res = await request(app).post('/api/auth/agent/sendOTP').send({ phone: '123' });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { success: false, message: 'Please enter a valid Nepal mobile number.' });
  });

  await t.test('eligible new and existing non-agent phones send AGENT_REGISTRATION OTP', async () => {
    const calls = [];
    const restore = patch(otpHelper, 'createAndSendOTP', async (p, purpose) => {
      calls.push([p, purpose]);
      return { expiresIn: '5 minutes' };
    });
    try {
      const p1 = phone(1);
      let res = await request(app).post('/api/auth/agent/sendOTP').send({ phone: p1 });
      assert.equal(res.status, 200);
      assert.deepEqual(res.body, {
        success: true,
        message: 'If this number is eligible, a verification code has been sent.',
      });
      const p2 = phone(2);
      await user(p2);
      res = await request(app).post('/api/auth/agent/sendOTP').send({ phone: p2 });
      assert.equal(res.status, 200);
      assert.deepEqual(calls, [[p1, 'AGENT_REGISTRATION'], [p2, 'AGENT_REGISTRATION']]);
    } finally {
      restore();
    }
  });

  await t.test('registered agent and banned/inactive users get neutral 200 without OTP', async () => {
    let called = false;
    const restore = patch(otpHelper, 'createAndSendOTP', async () => { called = true; });
    try {
      const p1 = phone(3);
      const agentUser = await user(p1, { role: 'agent', roles: ['agent'] });
      await Agent.create({ user: agentUser._id, applicationStatus: 'DRAFT' });
      for (const p of [p1, phone(4), phone(5)]) {
        if (p !== p1) await user(p, { status: p.endsWith('4') ? 'banned' : 'inactive' });
        const res = await request(app).post('/api/auth/agent/sendOTP').send({ phone: p });
        assert.equal(res.status, 200);
        assert.match(res.body.message, /eligible/);
      }
      assert.equal(called, false);
    } finally {
      restore();
    }
  });

  await t.test('orphaned agent role still sends OTP; blocked and generic errors map exactly', async () => {
    let mode = 'ok';
    const restore = patch(otpHelper, 'createAndSendOTP', async () => {
      if (mode === 'blocked') throw new Error('OTP_SEND_BLOCKED:7');
      if (mode === 'boom') throw new Error('boom');
      return { expiresIn: '5 minutes' };
    });
    try {
      const p1 = phone(6);
      await user(p1, { role: 'agent', roles: ['agent'] });
      let res = await request(app).post('/api/auth/agent/sendOTP').send({ phone: p1 });
      assert.equal(res.status, 200);
      mode = 'blocked';
      res = await request(app).post('/api/auth/agent/sendOTP').send({ phone: phone(7) });
      assert.equal(res.status, 429);
      assert.equal(res.body.errorCode, 'OTP_SEND_BLOCKED');
      assert.equal(res.body.retryAfterMinutes, 7);
      mode = 'boom';
      res = await request(app).post('/api/auth/agent/sendOTP').send({ phone: phone(8) });
      assert.equal(res.status, 500);
      assert.deepEqual(res.body, {
        success: false,
        message: 'Failed to send verification code. Please try again.',
      });
    } finally {
      restore();
    }
  });
});
