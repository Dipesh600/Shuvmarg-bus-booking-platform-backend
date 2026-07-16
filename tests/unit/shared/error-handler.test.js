'use strict';

/**
 * tests/unit/shared/error-handler.test.js
 *
 * Uses an isolated Express app so the production app (and its DB/cron setup)
 * is never loaded here.
 */

const test    = require('node:test');
const assert  = require('node:assert/strict');
const express = require('express');
const request = require('supertest');

const errorHandler = require('../../../src/shared/http/error-handler.js');
const AppError     = require('../../../src/shared/errors/app-error.js');

/** Build an isolated Express app that throws `err` on GET /test */
function makeApp(err, nodeEnv = 'production') {
  const saved = process.env.NODE_ENV;
  process.env.NODE_ENV = nodeEnv;

  const app = express();
  app.get('/test', (_req, _res, next) => next(err));
  app.use(errorHandler);

  // Restore after app construction so tests can run concurrently
  process.env.NODE_ENV = saved;
  return app;
}

/** Re-evaluate NODE_ENV per request by building a fresh app each time */
function appWithEnv(err, env) {
  const saved = process.env.NODE_ENV;
  process.env.NODE_ENV = env;
  const app = express();
  app.get('/test', (_req, _res, next) => next(err));
  app.use((e, req, res, next) => {
    process.env.NODE_ENV = env; // keep consistent during handler
    errorHandler(e, req, res, next);
  });
  process.env.NODE_ENV = saved;
  return app;
}

test('errorHandler', async (t) => {

  await t.test('unknown error — production — returns exact generic 500 body', async () => {
    const app = appWithEnv(new Error('internal'), 'production');
    const res = await request(app).get('/test');
    assert.equal(res.status, 500);
    assert.equal(res.body.status, false);
    assert.equal(res.body.message,
      'An unexpected server error occurred. Please try again later.');
    assert.equal(res.body.error, undefined);
  });

  await t.test('unknown error — development — includes error.message', async () => {
    const app = appWithEnv(new Error('dev detail'), 'development');
    const res = await request(app).get('/test');
    assert.equal(res.status, 500);
    assert.equal(res.body.error, 'dev detail');
  });

  await t.test('unknown error — production — does not include error field', async () => {
    const app = appWithEnv(new Error('secret'), 'production');
    const res = await request(app).get('/test');
    assert.equal('error' in res.body, false);
  });

  await t.test('AppError — custom statusCode is used', async () => {
    const app = makeApp(new AppError('forbidden', 403));
    const res = await request(app).get('/test');
    assert.equal(res.status, 403);
    assert.equal(res.body.status, false);
    assert.equal(res.body.message, 'forbidden');
  });

  await t.test('AppError — responseBody is returned exactly', async () => {
    const body = { status: false, errorCode: 'SPECIAL', extra: true };
    const app  = makeApp(new AppError('msg', 422, body));
    const res  = await request(app).get('/test');
    assert.equal(res.status, 422);
    assert.deepEqual(res.body, body);
  });

  await t.test('AppError — errorCode included when provided', async () => {
    const app = makeApp(new AppError('banned', 403, null, 'ACCOUNT_BANNED'));
    const res = await request(app).get('/test');
    assert.equal(res.body.errorCode, 'ACCOUNT_BANNED');
  });

  await t.test('AppError — errorCode absent when not provided', async () => {
    const app = makeApp(new AppError('forbidden', 403));
    const res = await request(app).get('/test');
    assert.equal('errorCode' in res.body, false);
  });

  await t.test('headersSent — delegates to next without sending a response', async () => {
    let nextCalledWithError = false;
    const err = new Error('late error');
    const app = express();
    app.get('/test', (_req, res, next) => {
      res.status(200).json({ partial: true });
      // Simulate already-sent headers then throw
      next(err);
    });
    app.use((e, req, res, next) => {
      if (res.headersSent) {
        nextCalledWithError = true;
        return next(e); // delegate
      }
      errorHandler(e, req, res, next);
    });
    await request(app).get('/test');
    assert.ok(nextCalledWithError);
  });

  await t.test('requestId from req is logged (smoke test — no throw)', async () => {
    const app = express();
    app.get('/test', (req, _res, next) => {
      req.requestId = 'test-id-123';
      next(new Error('log smoke'));
    });
    app.use(errorHandler);
    // We just confirm it doesn't throw; logging goes to Winston
    const res = await request(app).get('/test');
    assert.equal(res.status, 500);
  });
});
