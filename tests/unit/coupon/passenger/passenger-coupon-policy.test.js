"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const policy = require(
  "../../../../src/modules/coupon/passenger/passenger-coupon.policy"
);

test("validation policy preserves required and numeric amount contracts", () => {
  assert.deepEqual(policy.validateCouponInput({}), {
    statusCode: 400,
    body: {
      success: false,
      message: "Coupon code and order amount are required!",
    },
  });
  assert.deepEqual(
    policy.validateCouponInput({ couponCode: "SAVE", orderAmount: "bad" }),
    {
      statusCode: 400,
      body: {
        success: false,
        message: "Order amount must be a valid number!",
      },
    }
  );
  assert.deepEqual(
    policy.validateCouponInput({ couponCode: "SAVE", orderAmount: "500" }),
    { amount: 500 }
  );
});

test("usage-limit messages preserve singular and repeated wording", () => {
  assert.equal(
    policy.userLimitMessage(1, 1),
    "You have already used this coupon"
  );
  assert.equal(
    policy.userLimitMessage(2, 3),
    "You can only use this coupon 3 times and you've used it 2 times"
  );
});

test("search query policy preserves trim-only validation", () => {
  assert.equal(policy.validateSearchQuery(" ab "), null);
  assert.equal(policy.validateSearchQuery(" ").statusCode, 400);
  const invalid = policy.validateSearchQuery("x");
  assert.equal(invalid.statusCode, 400);
  assert.equal(
    invalid.body.message,
    "Search query must be at least 2 characters long!"
  );
});
