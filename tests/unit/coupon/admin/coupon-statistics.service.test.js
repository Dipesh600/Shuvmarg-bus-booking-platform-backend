'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createCouponStatisticsService,
} = require('../../../../src/modules/coupon/admin/statistics/coupon-statistics.service.js');

test('Coupon Statistics Service Unit Tests', async (t) => {
  await t.test('Delegates to repository with null/default couponId', async () => {
    let repoArg = undefined;

    const service = createCouponStatisticsService({
      repository: {
        aggregateCouponStatistics: async (id = null) => {
          repoArg = id;
          return [{ totalUsage: 10 }];
        },
      },
    });

    const result = await service.getCouponStats();
    assert.equal(repoArg, null);
    assert.deepEqual(result, [{ totalUsage: 10 }]);
  });

  await t.test('Delegates to repository with provided couponId', async () => {
    let repoArg = undefined;

    const service = createCouponStatisticsService({
      repository: {
        aggregateCouponStatistics: async (id = null) => {
          repoArg = id;
          return [{ couponId: id, totalUsage: 2 }];
        },
      },
    });

    const result = await service.getCouponStats('coup-99');
    assert.equal(repoArg, 'coup-99');
    assert.deepEqual(result, [{ couponId: 'coup-99', totalUsage: 2 }]);
  });

  await t.test('Replaces repository error with exact legacy error message', async () => {
    const service = createCouponStatisticsService({
      repository: {
        aggregateCouponStatistics: async () => {
          throw new Error('Raw MongoDB Connection Failed');
        },
      },
    });

    await assert.rejects(
      async () => {
        await service.getCouponStats();
      },
      (err) => {
        assert.equal(err.message, 'Error fetching coupon statistics');
        assert.notEqual(err.message, 'Raw MongoDB Connection Failed');
        return true;
      }
    );
  });
});
