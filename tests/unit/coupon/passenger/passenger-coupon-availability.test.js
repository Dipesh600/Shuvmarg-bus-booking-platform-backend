"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createCouponAvailabilityService,
} = require(
  "../../../../src/modules/coupon/passenger/coupon-availability.service"
);

test("available coupons preserve amount fallback and role propagation", async () => {
  const calls = [];
  const service = createCouponAvailabilityService({
    couponHelper: {
      getAvailableCoupons: async (...args) => {
        calls.push(args);
        return ["coupon"];
      },
    },
  });
  const result = await service.getAvailableCoupons({
    userId: "u1",
    orderAmount: "bad",
    activeRole: "passenger",
  });
  assert.deepEqual(calls, [["u1", 0, "passenger"]]);
  assert.deepEqual(result.body.data, ["coupon"]);
});

test("best coupon preserves ordering, alternatives, and calculations", async () => {
  const service = createCouponAvailabilityService({
    couponHelper: {
      getAvailableCoupons: async () => [
        { couponCode: "NO", canUse: false, potentialDiscount: 500 },
        {
          couponCode: "B",
          title: "B",
          discountType: "fixed",
          discountValue: 100,
          canUse: true,
          potentialDiscount: 100,
        },
        {
          couponCode: "A",
          title: "A",
          discountType: "fixed",
          discountValue: 200,
          canUse: true,
          potentialDiscount: 200,
        },
      ],
    },
  });
  const result = await service.getBestCoupon({
    userId: "u1",
    orderAmount: "1000",
    activeRole: "passenger",
  });
  assert.equal(result.body.data.couponCode, "A");
  assert.equal(result.body.data.finalAmount, 800);
  assert.equal(result.body.data.savings, 20);
  assert.deepEqual(result.body.alternatives.map((item) => item.couponCode), [
    "B",
  ]);
});

test("best coupon preserves required and no-applicable responses", async () => {
  const service = createCouponAvailabilityService({
    couponHelper: { getAvailableCoupons: async () => [] },
  });
  assert.equal((await service.getBestCoupon({})).statusCode, 400);
  assert.deepEqual(
    (await service.getBestCoupon({ orderAmount: 100 })).body,
    {
      success: true,
      message: "No applicable coupons found for this order amount.",
      data: null,
    }
  );
});
