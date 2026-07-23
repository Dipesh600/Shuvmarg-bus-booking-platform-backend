'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createCouponAnalyticsController,
} = require('../../../../src/modules/coupon/admin/analytics/coupon-analytics.controller');

function createMockRes() {
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

test('Coupon Analytics Controller Unit Contracts', async (t) => {
  await t.test('Case 1: Missing or invalid coupon ID returns exact 400 contract', async () => {
    const getCouponAnalytics = createCouponAnalyticsController({
      isValidObjectId: () => false,
    });

    const req = { params: { id: 'invalid-id' } };
    const res = createMockRes();

    await getCouponAnalytics(req, res);

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, {
      success: false,
      message: 'Valid Coupon ID is required!',
    });
  });

  await t.test('Case 2: Missing coupon returns exact 404 contract', async () => {
    const getCouponAnalytics = createCouponAnalyticsController({
      isValidObjectId: () => true,
      repository: {
        findCouponByIdWithCreators: async () => null,
      },
    });

    const req = { params: { id: '507f1f77bcf86cd799439011' } };
    const res = createMockRes();

    await getCouponAnalytics(req, res);

    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, {
      success: false,
      message: 'Coupon not found!',
    });
  });

  await t.test('Case 3: Successful result returns exact 200 status, message and mapped top-level structure', async () => {
    const mockCoupon = { _id: '507f1f77bcf86cd799439011', couponCode: 'SAVE10' };
    const mockDaily = [{ _id: '2026-07-23', redemptions: 1 }];
    const mockTopUsers = [{ _id: 'u1', timesUsed: 1 }];
    const mockUsageLog = [{ _id: 'ul1' }];
    const mockSummaryAgg = [{ totalRedemptions: 1 }];

    const repository = {
      findCouponByIdWithCreators: async () => mockCoupon,
      aggregateDailyUsageByCouponId: async () => mockDaily,
      aggregateTopUsersByCouponId: async () => mockTopUsers,
      findLatestCouponUsageLogs: async () => mockUsageLog,
      aggregateCouponSummaryByCouponId: async () => mockSummaryAgg,
    };

    const getCouponAnalytics = createCouponAnalyticsController({
      isValidObjectId: () => true,
      repository,
    });

    const req = { params: { id: '507f1f77bcf86cd799439011' } };
    const res = createMockRes();

    await getCouponAnalytics(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.message, 'Coupon analytics retrieved successfully!');
    assert.ok(res.body.data.coupon);
    assert.ok(res.body.data.summary);
    assert.ok(Array.isArray(res.body.data.dailyUsage));
    assert.ok(Array.isArray(res.body.data.topUsers));
    assert.ok(Array.isArray(res.body.data.usageLog));
  });

  await t.test('Case 4: Repository failure returns exact 500 contract and logs error', async () => {
    const repositoryErr = new Error('DB query failed');
    const getCouponAnalytics = createCouponAnalyticsController({
      isValidObjectId: () => true,
      repository: {
        findCouponByIdWithCreators: async () => {
          throw repositoryErr;
        },
      },
    });

    const req = { params: { id: '507f1f77bcf86cd799439011' } };
    const res = createMockRes();

    const originalConsoleError = console.error;
    let consoleErrorArgs = null;
    console.error = (...args) => {
      consoleErrorArgs = args;
    };

    try {
      await getCouponAnalytics(req, res);
    } finally {
      console.error = originalConsoleError;
    }

    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, {
      success: false,
      message: 'Internal Server Error!',
    });
    assert.equal(consoleErrorArgs[0], 'Error fetching coupon analytics:');
    assert.equal(consoleErrorArgs[1], repositoryErr);
  });
});
