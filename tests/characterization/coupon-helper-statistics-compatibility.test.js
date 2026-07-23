'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

test('CouponHelper.getCouponStats Compatibility Test', async () => {
  const servicePath = require.resolve(
    '../../src/modules/coupon/admin/statistics/coupon-statistics.service.js'
  );
  const helperPath = require.resolve('../../handlers/couponHelper.js');

  const oldServiceCache = require.cache[servicePath];
  const oldHelperCache = require.cache[helperPath];

  let forwardedId = undefined;
  let mockServiceResult = [{ totalUsage: 100 }];
  let shouldFailService = false;

  try {
    require.cache[servicePath] = {
      id: servicePath,
      filename: servicePath,
      loaded: true,
      exports: {
        createCouponStatisticsService: () => {},
        getCouponStats: async (couponId = null) => {
          forwardedId = couponId;
          if (shouldFailService) {
            throw new Error('Error fetching coupon statistics');
          }
          return mockServiceResult;
        },
      },
    };

    delete require.cache[helperPath];
    const CouponHelper = require('../../handlers/couponHelper.js');

    assert.equal(typeof CouponHelper.getCouponStats, 'function');

    // Case 1: forwards couponId and returns result
    const res1 = await CouponHelper.getCouponStats('cid-123');
    assert.equal(forwardedId, 'cid-123');
    assert.deepEqual(res1, mockServiceResult);

    // Case 2: default null argument
    await CouponHelper.getCouponStats();
    assert.equal(forwardedId, null);

    // Case 3: service rejection remains a rejection
    shouldFailService = true;
    await assert.rejects(
      async () => {
        await CouponHelper.getCouponStats('cid-err');
      },
      (err) => {
        assert.equal(err.message, 'Error fetching coupon statistics');
        return true;
      }
    );
  } finally {
    if (oldServiceCache) require.cache[servicePath] = oldServiceCache;
    else delete require.cache[servicePath];

    if (oldHelperCache) require.cache[helperPath] = oldHelperCache;
    else delete require.cache[helperPath];
  }
});
