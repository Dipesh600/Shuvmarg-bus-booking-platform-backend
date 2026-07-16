'use strict';

const test   = require('node:test');
const assert = require('node:assert/strict');
const AppError = require('../../../src/shared/errors/app-error.js');

test('AppError', async (t) => {

  await t.test('sets statusCode and message', () => {
    const err = new AppError('Not found', 404);
    assert.equal(err.message, 'Not found');
    assert.equal(err.statusCode, 404);
  });

  await t.test('is an instance of Error', () => {
    const err = new AppError('oops', 400);
    assert.ok(err instanceof Error);
    assert.ok(err instanceof AppError);
  });

  await t.test('isOperational is always true', () => {
    const err = new AppError('forbidden', 403);
    assert.equal(err.isOperational, true);
  });

  await t.test('name is AppError', () => {
    const err = new AppError('x', 500);
    assert.equal(err.name, 'AppError');
  });

  await t.test('defaults statusCode to 500 when not supplied', () => {
    const err = new AppError('server error');
    assert.equal(err.statusCode, 500);
  });

  await t.test('optional responseBody is stored exactly', () => {
    const body = { status: false, errorCode: 'SOME_CODE', custom: true };
    const err = new AppError('msg', 422, body);
    assert.deepEqual(err.responseBody, body);
  });

  await t.test('responseBody defaults to null when not supplied', () => {
    const err = new AppError('msg', 400);
    assert.equal(err.responseBody, null);
  });

  await t.test('optional errorCode is stored', () => {
    const err = new AppError('banned', 403, null, 'ACCOUNT_BANNED');
    assert.equal(err.errorCode, 'ACCOUNT_BANNED');
  });

  await t.test('errorCode defaults to null when not supplied', () => {
    const err = new AppError('msg', 400);
    assert.equal(err.errorCode, null);
  });

  await t.test('optional cause is stored', () => {
    const upstream = new Error('DB timeout');
    const err = new AppError('wrapped', 500, null, null, upstream);
    assert.equal(err.cause, upstream);
  });

  await t.test('cause defaults to null when not supplied', () => {
    const err = new AppError('msg', 500);
    assert.equal(err.cause, null);
  });

  await t.test('has a stack trace', () => {
    const err = new AppError('trace test', 500);
    assert.ok(typeof err.stack === 'string');
    assert.ok(err.stack.length > 0);
  });
});
