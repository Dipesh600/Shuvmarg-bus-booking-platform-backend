'use strict';

const test    = require('node:test');
const assert  = require('node:assert/strict');
const respond = require('../../../src/shared/http/respond.js');

// Minimal mock response
const makeRes = () => {
  const res = {
    _status: null,
    _body:   undefined,
    status(code)  { this._status = code; return this; },
    json(body)    { this._body   = body; return this; },
  };
  return res;
};

test('respond', async (t) => {

  await t.test('sets the HTTP status code', () => {
    const res = makeRes();
    respond(res, 201, {});
    assert.equal(res._status, 201);
  });

  await t.test('sets the response body exactly', () => {
    const res  = makeRes();
    const body = { success: true, data: [1, 2, 3] };
    respond(res, 200, body);
    assert.deepEqual(res._body, body);
  });

  await t.test('does not inject extra fields', () => {
    const res  = makeRes();
    const body = { custom: 'shape' };
    respond(res, 200, body);
    assert.deepEqual(Object.keys(res._body), ['custom']);
  });

  await t.test('passes a 404 status through unchanged', () => {
    const res  = makeRes();
    const body = { status: false, message: 'Not found' };
    respond(res, 404, body);
    assert.equal(res._status, 404);
    assert.deepEqual(res._body, body);
  });

  await t.test('passes a 500 status through unchanged', () => {
    const res  = makeRes();
    const body = { status: false, message: 'Server error' };
    respond(res, 500, body);
    assert.equal(res._status, 500);
    assert.deepEqual(res._body, body);
  });

  await t.test('preserves legacy status:false shape without renaming', () => {
    const res  = makeRes();
    const body = { status: false, errorCode: 'BANNED', message: 'Banned' };
    respond(res, 403, body);
    assert.equal(res._body.status, false);
    assert.equal(res._body.errorCode, 'BANNED');
    assert.equal(res._body.message, 'Banned');
    assert.equal(Object.keys(res._body).length, 3);
  });
});
