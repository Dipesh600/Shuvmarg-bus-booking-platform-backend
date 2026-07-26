'use strict';

process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const otpModule = require('../../../middleware/otpRateLimiter');
const loginModule = require('../../../middleware/loginRateLimiters');

const appFor = (middleware, withUser = false) => {
  const app = express();
  app.use(express.json());
  if (withUser) {
    app.use((req, _res, next) => {
      req.userInfo = { id: req.body.userId || '' };
      next();
    });
  }
  app.post('/attempt', middleware, (_req, res) => res.status(200).json({ success: true }));
  return app;
};

const exhaust = async (app, max, body = {}) => {
  let response;
  for (let attempt = 0; attempt <= max; attempt += 1) {
    response = await request(app).post('/attempt').send(body);
  }
  return response;
};

test('auth limiter factories own their middleware state', async (t) => {
  await t.test('OTP factory calls create independent verify and send stores', () => {
    const first = otpModule.createOtpRateLimiters();
    const second = otpModule.createOtpRateLimiters();
    assert.notStrictEqual(first.stores.verifyStore, second.stores.verifyStore);
    assert.notStrictEqual(first.stores.sendStore, second.stores.sendStore);
  });

  for (const [name, store] of [
    ['passenger-login', 'passengerLoginStore'],
    ['agent-login', 'agentLoginStore'],
    ['bus-owner-login', 'busOwnerLoginStore'],
    ['password-change', 'passwordChangeStore'],
  ]) {
    await t.test(`factory calls create independent ${name} stores`, () => {
      const first = loginModule.createLoginRateLimiters();
      const second = loginModule.createLoginRateLimiters();
      assert.notStrictEqual(first.stores[store], second.stores[store]);
    });
  }

  await t.test('exhausting limiter A does not affect limiter B', async () => {
    const first = loginModule.createLoginRateLimiters();
    const second = loginModule.createLoginRateLimiters();
    const body = { phone: '9800000000' };
    assert.equal((await exhaust(appFor(first.loginRateLimiter), 10, body)).status, 429);
    assert.equal((await request(appFor(second.loginRateLimiter))
      .post('/attempt').send(body)).status, 200);
  });

  await t.test('OTP executable values and response bodies are exact', async () => {
    const limiters = otpModule.createOtpRateLimiters();
    const verify = await exhaust(appFor(limiters.otpVerifyLimiter), 10, {
      phone: ' 9800 000 001 ',
    });
    assert.equal(verify.status, 429);
    assert.deepEqual(verify.body, {
      success: false,
      message: 'Too many verification attempts for this phone number. Please wait 10 minutes.',
      errorCode: 'OTP_VERIFY_RATE_LIMIT',
    });
    assert.equal(verify.headers['ratelimit-limit'], '10');
    assert.match(verify.headers['ratelimit-policy'], /w=600/);
    assert.equal(verify.headers['x-ratelimit-limit'], undefined);

    const send = await exhaust(appFor(limiters.otpSendLimiter), 20);
    assert.equal(send.status, 429);
    assert.deepEqual(send.body, {
      success: false,
      message: 'Too many OTP requests from this device. Please wait 15 minutes.',
      errorCode: 'OTP_SEND_IP_RATE_LIMIT',
    });
    assert.equal(send.headers['ratelimit-limit'], '20');
    assert.match(send.headers['ratelimit-policy'], /w=900/);
  });

  await t.test('login executable values and response bodies are exact', async () => {
    const limiters = loginModule.createLoginRateLimiters();
    const cases = [
      ['loginRateLimiter', 'LOGIN_RATE_LIMIT',
        'Too many login attempts. Please wait 15 minutes.'],
      ['agentLoginRateLimiter', 'LOGIN_RATE_LIMIT',
        'Too many login attempts. Please wait 15 minutes.'],
      ['busOwnerLoginRateLimiter', 'LOGIN_RATE_LIMIT_EXCEEDED',
        'Too many login attempts for this account. Please wait 15 minutes.'],
    ];
    for (const [key, errorCode, message] of cases) {
      const response = await exhaust(appFor(limiters[key]), 10, {
        emailOrPhone: ' Mixed Case ',
      });
      assert.equal(response.status, 429);
      assert.deepEqual(response.body, { success: false, message, errorCode });
      assert.equal(response.headers['ratelimit-limit'], '10');
      assert.match(response.headers['ratelimit-policy'], /w=900/);
    }
  });

  await t.test('password-change executable key, values, and body are exact', async () => {
    const limiters = loginModule.createLoginRateLimiters();
    const app = appFor(limiters.passwordChangeLimiter, true);
    const response = await exhaust(app, 5, { userId: 'account-1' });
    assert.equal(response.status, 429);
    assert.deepEqual(response.body, {
      success: false,
      message: 'Too many password change attempts. Please wait 15 minutes.',
    });
    assert.equal(response.headers['ratelimit-limit'], '5');
    assert.match(response.headers['ratelimit-policy'], /w=900/);
  });

  await t.test('account keys remove whitespace and lowercase exactly', async () => {
    const limiter = loginModule.createLoginRateLimiters().loginRateLimiter;
    const app = appFor(limiter);
    for (let count = 0; count < 5; count += 1) {
      assert.equal((await request(app).post('/attempt')
        .send({ emailOrPhone: ' A B C ' })).status, 200);
      assert.equal((await request(app).post('/attempt')
        .send({ emailOrPhone: 'abc' })).status, 200);
    }
    assert.equal((await request(app).post('/attempt')
      .send({ emailOrPhone: 'Ab C' })).status, 429);
  });

  await t.test('production instances stay enabled without global resets or bypasses', async () => {
    assert.equal(otpModule.resetAll, undefined);
    assert.equal(loginModule.resetAll, undefined);
    const response = await request(appFor(loginModule.loginRateLimiter))
      .post('/attempt').send({ phone: 'factory-production-unique' });
    assert.equal(response.status, 200);
    assert.equal(response.headers['ratelimit-limit'], '10');
    assert.match(response.headers['ratelimit-policy'], /w=900/);
  });
});
