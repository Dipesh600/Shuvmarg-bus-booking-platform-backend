'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createCouponStatisticsController,
} = require('../../../../src/modules/coupon/admin/statistics/coupon-statistics.controller.js');

test('Coupon Statistics Controller Unit Tests', async (t) => {
  await t.test('Success: calls service with no arguments and returns 200 with data', async () => {
    let serviceArgs = null;
    const mockStats = [{ couponCode: 'SAVE20', totalUsage: 5 }];

    const controller = createCouponStatisticsController({
      service: {
        getCouponStats: async (...args) => {
          serviceArgs = args;
          return mockStats;
        },
      },
    });

    let statusCode = null;
    let responseBody = null;

    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(body) {
        responseBody = body;
        return this;
      },
    };

    await controller.getCouponUsageStats({}, res);

    assert.equal(serviceArgs.length, 0, 'Service must be called with no arguments');
    assert.equal(statusCode, 200);
    assert.deepEqual(responseBody, {
      success: true,
      message: 'Coupon usage statistics retrieved successfully!',
      data: mockStats,
    });
  });

  await t.test('Failure: returns 500 and logs exact error label when service throws', async () => {
    let loggedErrorLabel = null;
    let loggedErr = null;
    const originalConsoleError = console.error;

    console.error = (label, err) => {
      loggedErrorLabel = label;
      loggedErr = err;
    };

    try {
      const controller = createCouponStatisticsController({
        service: {
          getCouponStats: async () => {
            throw new Error('Database failure');
          },
        },
      });

      let statusCode = null;
      let responseBody = null;

      const res = {
        status(code) {
          statusCode = code;
          return this;
        },
        json(body) {
          responseBody = body;
          return this;
        },
      };

      await controller.getCouponUsageStats({}, res);

      assert.equal(statusCode, 500);
      assert.deepEqual(responseBody, {
        success: false,
        message: 'Internal Server Error!',
      });
      assert.equal(loggedErrorLabel, 'Error fetching coupon stats:');
      assert.equal(loggedErr.message, 'Database failure');
    } finally {
      console.error = originalConsoleError;
    }
  });
});
