'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createDatabaseHelper } = require('../helpers/db');
const createAuthTestApp = require('../helpers/auth-app');

const login = (app) => request(app)
  .post('/api/login')
  .send({ phone: '9800000000' });
const sendAttempts = async (app, count) => {
  let response;
  for (let attempt = 0; attempt < count; attempt += 1) {
    response = await login(app);
  }
  return response;
};

test('auth test apps isolate limiter ownership', async (t) => {
  const connection = {
    readyState: 1,
    collections: { users: { deleteMany: async () => {} } },
    dropDatabase: async () => {},
    close: async () => { connection.readyState = 0; },
  };
  const db = createDatabaseHelper({
    mongooseInstance: { connection, connect: async () => connection },
  });
  await db.connect();
  t.after(async () => db.disconnect());

  const appB = createAuthTestApp();
  const appA = createAuthTestApp();
  t.after(async () => {
    await appA.teardown();
    await appB.teardown();
  });

  await t.test('app A and app B own different limiter sets', () => {
    assert.notStrictEqual(
      appA.loginRateLimiters.stores.passengerLoginStore,
      appB.loginRateLimiters.stores.passengerLoginStore,
    );
  });

  await t.test('app A reaches the exact limiter response', async () => {
    const response = await sendAttempts(appA.app, 11);
    assert.equal(response.status, 429);
    assert.deepEqual(response.body, {
      success: false,
      message: 'Too many login attempts. Please wait 15 minutes.',
      errorCode: 'LOGIN_RATE_LIMIT',
    });
  });

  await t.test('app B still returns its normal route response', async () => {
    const response = await login(appB.app);
    assert.equal(response.status, 400);
    assert.notEqual(response.body.errorCode, 'LOGIN_RATE_LIMIT');
  });

  await t.test('database cleanup for app B does not reset app A', async () => {
    await db.clearAll();
    const response = await login(appA.app);
    assert.equal(response.status, 429);
    assert.equal(response.body.errorCode, 'LOGIN_RATE_LIMIT');
  });

  await t.test('tearing down app B does not mutate app A stores', async () => {
    await appB.teardown();
    const response = await login(appA.app);
    assert.equal(response.status, 429);
  });

  await t.test('reverse construction order has the same isolation', async () => {
    const appC = createAuthTestApp();
    const appD = createAuthTestApp();
    try {
      const limited = await sendAttempts(appD.app, 11);
      const normal = await login(appC.app);
      assert.equal(limited.status, 429);
      assert.equal(normal.status, 400);
    } finally {
      await appD.teardown();
      await appC.teardown();
    }
  });

  await t.test('one app reset never becomes a global reset', async () => {
    assert.equal(require('../../middleware/otpRateLimiter').resetAll, undefined);
    assert.equal(require('../../middleware/loginRateLimiters').resetAll, undefined);
  });
});
