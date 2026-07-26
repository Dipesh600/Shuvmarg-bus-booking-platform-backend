'use strict';

process.env.NODE_ENV = 'test';
process.env.SECRET_KEY ||= 'test-only-secret-32chars-minimum!!';
process.env.VERIFICATION_TOKEN_SECRET ||= 'test-only-verification-secret!!';
process.env.SPARROW_SMS_TOKEN ||= 'test-stub';
process.env.CLOUDINARY_NAME ||= 'test';
process.env.CLOUDINARY_API_KEY ||= 'test';
process.env.CLOUDINARY_SECRET_KEY ||= 'test';
process.env.FCM_PROJECT_ID ||= '';
process.env.FCM_CLIENT_EMAIL ||= '';
process.env.FCM_PRIVATE_KEY ||= '';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createGlobalRateLimiters } = require('../../../middleware/globalRateLimiters');
const { createApp } = require('../../../src/app');

const buildApp = (limiters) => createApp({
  apiLimiter: limiters.apiLimiter,
  searchLimiter: limiters.searchLimiter,
});

test('global rate limiters own their middleware state and isolate instances', async (t) => {
  await t.test('createGlobalRateLimiters creates independent stores', () => {
    const first = createGlobalRateLimiters();
    const second = createGlobalRateLimiters();
    assert.notStrictEqual(first.stores.apiStore, second.stores.apiStore);
    assert.notStrictEqual(first.stores.searchStore, second.stores.searchStore);
  });

  await t.test('API limiter isolation: exhausting app A does not block app B', async () => {
    const limitersA = createGlobalRateLimiters();
    const limitersB = createGlobalRateLimiters();
    const appA = buildApp(limitersA);
    const appB = buildApp(limitersB);

    for (let i = 0; i < 200; i += 1) {
      await request(appA).get('/api/limiter-test');
    }
    const blockedA = await request(appA).get('/api/limiter-test');
    assert.equal(blockedA.status, 429);
    assert.deepEqual(blockedA.body, {
      success: false,
      message: 'Too many requests from this IP. Try again in 15 minutes.',
    });

    const allowedB = await request(appB).get('/api/limiter-test');
    assert.notEqual(allowedB.status, 429);
  });

  await t.test('Search limiter isolation: exhausting app A does not block app B', async () => {
    const limitersA = createGlobalRateLimiters();
    const limitersB = createGlobalRateLimiters();
    const appA = buildApp(limitersA);
    const appB = buildApp(limitersB);

    for (let i = 0; i < 30; i += 1) {
      await request(appA).get('/api/public/searchTrips');
    }
    const blockedA = await request(appA).get('/api/public/searchTrips');
    assert.equal(blockedA.status, 429);
    assert.deepEqual(blockedA.body, {
      success: false,
      message: 'Search rate limit exceeded. Please slow down.',
    });

    const allowedB = await request(appB).get('/api/public/searchTrips');
    assert.notEqual(allowedB.status, 429);
  });
});
