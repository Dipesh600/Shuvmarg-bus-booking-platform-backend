"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createCouponValidationService,
} = require(
  "../../../../src/modules/coupon/passenger/coupon-validation.service"
);
const policy = require(
  "../../../../src/modules/coupon/passenger/passenger-coupon.policy"
);
const mapper = require(
  "../../../../src/modules/coupon/passenger/passenger-coupon.mapper"
);

function setup(overrides = {}) {
  const calls = [];
  const coupon = { _id: "c1", perUserLimit: 3 };
  const service = createCouponValidationService({
    repository: {
      findActiveCoupon: async (code) => {
        calls.push(["find", code]);
        return coupon;
      },
      countValidationUsage: async (...args) => {
        calls.push(["count", ...args]);
        return 0;
      },
    },
    couponHelper: {
      validateCoupon: async (...args) => {
        calls.push(["validate", ...args]);
        return {
          isValid: true,
          coupon: {
            couponCode: "SAVE",
            title: "Save",
            description: "Offer",
            discountType: "fixed",
            discountValue: 50,
          },
          discountAmount: 50,
          finalAmount: 450,
          savings: 10,
        };
      },
    },
    policy,
    mapper,
    ...overrides,
  });
  return { service, calls, coupon };
}

test("validation preserves coupon lookup, usage, helper arguments, and response", async () => {
  const { service, calls } = setup();
  const result = await service({
    couponCode: "save",
    orderAmount: "500",
    scheduleId: "s1",
    userId: "u1",
    activeRole: "passenger",
  });
  assert.deepEqual(calls, [
    ["find", "save"],
    ["count", "u1", "c1"],
    ["validate", "save", "u1", 500, "s1", "passenger"],
  ]);
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.data.originalAmount, "500");
  assert.equal(result.body.data.finalAmount, 450);
});

test("missing coupon and user limit stop before helper validation", async () => {
  const missing = setup({
    repository: {
      findActiveCoupon: async () => null,
      countValidationUsage: async () => {
        throw new Error("must not run");
      },
    },
  });
  assert.equal(
    (await missing.service({ couponCode: "x", orderAmount: 1 })).body.errorCode,
    "INVALID_COUPON"
  );

  const limited = setup();
  limited.service = createCouponValidationService({
    repository: {
      findActiveCoupon: async () => limited.coupon,
      countValidationUsage: async () => 3,
    },
    couponHelper: { validateCoupon: async () => assert.fail("must not run") },
    policy,
    mapper,
  });
  const result = await limited.service({
    couponCode: "SAVE",
    orderAmount: 100,
    userId: "u1",
  });
  assert.equal(result.body.errorCode, "USER_LIMIT_REACHED");
});

test("helper rejection preserves its message and error code", async () => {
  const base = setup();
  const service = createCouponValidationService({
    repository: {
      findActiveCoupon: async () => base.coupon,
      countValidationUsage: async () => 0,
    },
    couponHelper: {
      validateCoupon: async () => ({
        isValid: false,
        error: "Expired",
        errorCode: "COUPON_EXPIRED",
      }),
    },
    policy,
    mapper,
  });
  assert.deepEqual(
    (await service({ couponCode: "SAVE", orderAmount: 100 })).body,
    {
      success: false,
      message: "Expired",
      errorCode: "COUPON_EXPIRED",
    }
  );
});
