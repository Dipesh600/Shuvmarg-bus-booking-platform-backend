'use strict';

process.env.SECRET_KEY ||= 'test-only-secret-32chars-minimum!!';
process.env.VERIFICATION_TOKEN_SECRET ||= 'test-only-verification-secret!!';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const db = require('../helpers/db');
const app = require('../helpers/app');
const service = require('../../src/modules/agent/auth/registration/agent-registration.service');
const errors = require('../../src/modules/agent/auth/registration/agent-registration.errors');

const patch = (obj, key, fn) => {
  const old = obj[key];
  obj[key] = fn;
  return () => { obj[key] = old; };
};

test('Agent registration error characterization', async (t) => {
  t.before(async () => db.connect());
  t.after(async () => db.disconnect());
  t.beforeEach(async () => db.clearAll());

  await t.test('register duplicate-key mappings preserve exact bodies', async () => {
    for (const [field, body] of [
      ['phone', { success: false, message: 'Mobile number is already registered.' }],
      ['email', { success: false, message: 'Email address is already registered.' }],
      ['agentId', { success: false, message: 'Agent ID is already registered.' }],
      ['other', { success: false, message: 'This information is already registered with another account.' }],
    ]) {
      const err = Object.assign(new Error('dup'), { code: 11000, keyPattern: { [field]: 1 } });
      const mapped = errors.duplicateKeyError(err);
      assert.equal(mapped.statusCode, 409);
      assert.deepEqual(mapped.responseBody, body);
    }
    const mapped = errors.duplicateKeyError(
      Object.assign(new Error('dup'), { code: 11000, keyPattern: { user: 1 } }),
    );
    assert.deepEqual(mapped.responseBody, {
      success: false,
      message: 'An agent account for this phone number already exists. Please log in instead.',
      errorCode: 'AGENT_ALREADY_EXISTS',
      hint: 'login',
    });
  });

  await t.test('unexpected register failure preserves generic 500', async () => {
    const restore = patch(service, 'register', async () => { throw new Error('boom'); });
    try {
      const res = await request(app).post('/api/auth/agent/register').send({
        phone: '9817400001',
        name: 'Valid Agent',
        password: 'AgentPass123!',
        verificationToken: 'tok',
      });
      assert.equal(res.status, 500);
      assert.deepEqual(res.body, {
        success: false,
        message: 'Registration failed. Please try again.',
      });
    } finally {
      restore();
    }
  });

  await t.test('cookie-setting failure maps through register catch', async () => {
    const restore = patch(service, 'register', async () => ({
      statusCode: 201,
      refreshToken: 'rt',
      responseBody: { success: true },
    }));
    try {
      const originalCookie = app.response.cookie;
      app.response.cookie = () => { throw new Error('cookie'); };
      try {
        const res = await request(app).post('/api/auth/agent/register').send({
          phone: '9817400002',
          name: 'Valid Agent',
          password: 'AgentPass123!',
          verificationToken: 'tok',
        });
        assert.equal(res.status, 500);
        assert.equal(res.body.message, 'Registration failed. Please try again.');
      } finally {
        app.response.cookie = originalCookie;
      }
    } finally {
      restore();
    }
  });
});
