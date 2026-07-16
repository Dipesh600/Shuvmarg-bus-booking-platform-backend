'use strict';

const test         = require('node:test');
const assert       = require('node:assert/strict');
const asyncHandler = require('../../../src/shared/http/async-handler.js');

// Minimal mock objects for req / res / next
const makeReq = () => ({});
const makeRes = () => ({
  status(code) { this.statusCode = code; return this; },
  json(body)   { this._body = body; return this; },
});

test('asyncHandler', async (t) => {

  await t.test('passes req/res/next to the wrapped handler', async () => {
    let called = false;
    const handler = asyncHandler(async (req, res, next) => {
      called = true;
      assert.ok(req);
      assert.ok(res);
      assert.ok(typeof next === 'function');
    });
    await handler(makeReq(), makeRes(), () => {});
    assert.ok(called);
  });

  await t.test('does not call next when handler resolves successfully', async () => {
    let nextCalled = false;
    const handler = asyncHandler(async (_req, res) => {
      res.status(200).json({ ok: true });
    });
    await handler(makeReq(), makeRes(), (err) => { nextCalled = true; });
    assert.equal(nextCalled, false);
  });

  await t.test('forwards rejection to next(error)', async () => {
    const boom = new Error('async boom');
    let caught;
    const handler = asyncHandler(async () => { throw boom; });
    await handler(makeReq(), makeRes(), (err) => { caught = err; });
    assert.equal(caught, boom);
  });

  await t.test('returns the result of the handler', async () => {
    const res = makeRes();
    const handler = asyncHandler(async (_req, r) => r.status(201).json({ created: true }));
    await handler(makeReq(), res, () => {});
    assert.equal(res.statusCode, 201);
    assert.deepEqual(res._body, { created: true });
  });
});
