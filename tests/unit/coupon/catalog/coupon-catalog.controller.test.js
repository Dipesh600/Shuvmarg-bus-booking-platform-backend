'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createCouponCatalogController } = require('../../../../src/modules/coupon/catalog/coupon-catalog.controller.js');

function createMockRes() {
  const headers = {};
  return {
    statusCode: null,
    body: null,
    headers,
    set(key, val) { this.headers[key] = val; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

test('Coupon Catalog Controller Contracts', async (t) => {
  await t.test('Case 1: active-only success returns exact status, message, cache-header and data', async () => {
    const mockCoupons = [{ _id: 'c1', couponCode: 'SAVE10' }];
    const mockMapped = [{ _id: 'c1', couponCode: 'SAVE10', imageUrl: 'https://cdn/img.png' }];

    const controller = createCouponCatalogController({
      repository: { findActiveCoupons: async (now) => { assert.ok(now instanceof Date); return mockCoupons; } },
      mapper: { mapActiveCouponList: async (coupons) => { assert.equal(coupons, mockCoupons); return mockMapped; } },
    });

    const res = createMockRes();
    await controller.getAllCouponsForUser({}, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['Cache-Control'], 'public, max-age=60, stale-while-revalidate=300');
    assert.deepEqual(res.body, { success: true, message: 'All coupons retrieved successfully!', data: mockMapped });
  });

  await t.test('Case 2: active-and-expired success returns combined list in order (active before expired)', async () => {
    let expiredCallArgs = null;

    const controller = createCouponCatalogController({
      repository: {
        findActiveCoupons: async () => [{ _id: 'active1' }],
        findRecentlyExpiredCoupons: async (now, thirtyDaysAgo) => {
          expiredCallArgs = { now, thirtyDaysAgo };
          return [{ _id: 'expired1' }];
        },
      },
      mapper: {
        mapCouponListIncludingStatus: async (coupons) => {
          if (coupons[0]._id === 'active1') return [{ _id: 'active1', isActive: true }];
          return [{ _id: 'expired1', isActive: false }];
        },
      },
    });

    const res = createMockRes();
    await controller.getAllCouponsIncludingExpired({}, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['Cache-Control'], 'public, max-age=60, stale-while-revalidate=300');
    assert.deepEqual(res.body.data, [{ _id: 'active1', isActive: true }, { _id: 'expired1', isActive: false }]);
    assert.ok(expiredCallArgs.thirtyDaysAgo < expiredCallArgs.now);
  });

  await t.test('Case 3: active-only repository failure returns exact 500 body and log label', async () => {
    const err = new Error('Database connection failed');
    const controller = createCouponCatalogController({
      repository: { findActiveCoupons: async () => { throw err; } },
    });

    const res = createMockRes();
    const origConsoleError = console.error;
    let loggedArgs = null;
    console.error = (...args) => { loggedArgs = args; };

    try {
      await controller.getAllCouponsForUser({}, res);
    } finally {
      console.error = origConsoleError;
    }

    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { success: false, message: 'Internal Server Error!' });
    assert.equal(loggedArgs[0], 'Error fetching all coupons:');
    assert.equal(loggedArgs[1], err);
  });

  await t.test('Case 4: combined-endpoint failure returns exact 500 body and log label', async () => {
    const err = new Error('Mapper failure');
    const controller = createCouponCatalogController({
      repository: {
        findActiveCoupons: async () => [],
        findRecentlyExpiredCoupons: async () => [],
      },
      mapper: { mapCouponListIncludingStatus: async () => { throw err; } },
    });

    const res = createMockRes();
    const origConsoleError = console.error;
    let loggedArgs = null;
    console.error = (...args) => { loggedArgs = args; };

    try {
      await controller.getAllCouponsIncludingExpired({}, res);
    } finally {
      console.error = origConsoleError;
    }

    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { success: false, message: 'Internal Server Error!' });
    assert.equal(loggedArgs[0], 'Error fetching all coupons with expired:');
    assert.equal(loggedArgs[1], err);
  });
});
