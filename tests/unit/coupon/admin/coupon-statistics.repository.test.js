'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createCouponStatisticsRepository,
} = require('../../../../src/modules/coupon/admin/statistics/coupon-statistics.repository.js');

test('Coupon Statistics Repository Unit Tests', async (t) => {
  await t.test('No couponId produces $match: {} and exact pipeline stages', async () => {
    let capturedPipeline = null;

    const repository = createCouponStatisticsRepository({
      CouponUsageModel: {
        aggregate: async (pipeline) => {
          capturedPipeline = pipeline;
          return [{ couponCode: 'SAVE10' }];
        },
      },
    });

    const res = await repository.aggregateCouponStatistics();

    assert.deepEqual(res, [{ couponCode: 'SAVE10' }]);
    assert.equal(capturedPipeline.length, 5);

    // Verify stage order
    assert.ok('$match' in capturedPipeline[0]);
    assert.ok('$group' in capturedPipeline[1]);
    assert.ok('$lookup' in capturedPipeline[2]);
    assert.ok('$unwind' in capturedPipeline[3]);
    assert.ok('$project' in capturedPipeline[4]);

    // Verify $match condition
    assert.deepEqual(capturedPipeline[0].$match, {});

    // Verify $lookup collection
    assert.equal(capturedPipeline[2].$lookup.from, 'coupons');

    // Verify projection formulas
    const project = capturedPipeline[4].$project;
    assert.deepEqual(project.uniqueUsersCount, { $size: '$uniqueUsers' });
    assert.deepEqual(project.averageDiscount, {
      $divide: ['$totalDiscountGiven', '$totalUsage'],
    });
    assert.deepEqual(project.conversionRate, {
      $multiply: [
        { $divide: ['$totalDiscountGiven', '$totalOriginalAmount'] },
        100,
      ],
    });
  });

  await t.test('Provided couponId produces $match: { couponId: "c1" }', async () => {
    let capturedPipeline = null;

    const repository = createCouponStatisticsRepository({
      CouponUsageModel: {
        aggregate: async (pipeline) => {
          capturedPipeline = pipeline;
          return [];
        },
      },
    });

    await repository.aggregateCouponStatistics('c1');

    assert.deepEqual(capturedPipeline[0].$match, { couponId: 'c1' });
  });
});
