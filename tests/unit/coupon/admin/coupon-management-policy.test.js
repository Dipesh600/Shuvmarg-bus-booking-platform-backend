"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const policy = require(
  "../../../../src/modules/coupon/admin/management/coupon-write.policy"
);
const imagePolicy = require(
  "../../../../src/modules/coupon/admin/management/coupon-image-key.policy"
);

const valid = {
  couponCode: "SAVE10",
  title: "Save",
  discountType: "percentage",
  discountValue: 10,
  validFrom: "2026-01-01",
  validTo: "2026-02-01",
};

test("creation validation preserves required-field ordering", () => {
  assert.equal(policy.validateCreate({}), "Coupon Code is required!");
  assert.equal(
    policy.validateCreate({ couponCode: "X" }),
    "Title is required!"
  );
  assert.equal(
    policy.validateCreate({ ...valid, discountValue: 0 }),
    "Discount Value is required!"
  );
});

test("creation validation preserves discount and date rules", () => {
  assert.equal(
    policy.validateCreate({ ...valid, discountType: "other" }),
    "Discount type must be either 'percentage' or 'fixed'!"
  );
  assert.equal(
    policy.validateCreate({ ...valid, discountValue: 101 }),
    "Percentage discount must be between 0 and 100!"
  );
  assert.equal(
    policy.validateCreate({
      ...valid,
      validFrom: "2026-02-01",
      validTo: "2026-01-01",
    }),
    "Valid from date must be before valid to date!"
  );
  assert.equal(policy.validateCreate(valid), null);
});

test("update allowlist preserves fields and marks objects modified", () => {
  const modified = [];
  const coupon = { markModified: (key) => modified.push(key) };
  policy.applyEditableUpdates(coupon, {
    couponCode: "lower",
    designConfig: { color: "red" },
    usedCount: 999,
  });
  assert.equal(coupon.couponCode, "LOWER");
  assert.deepEqual(coupon.designConfig, { color: "red" });
  assert.equal(coupon.usedCount, undefined);
  assert.deepEqual(modified, ["designConfig"]);
});

test("image-key policy preserves URL conversion and traversal guard", () => {
  assert.equal(
    imagePolicy.storedImageKey(
      "https://bucket.example/platform/coupons/a.jpg"
    ),
    "platform/coupons/a.jpg"
  );
  assert.equal(imagePolicy.storedImageKey("not a URL"), "not a URL");
  assert.equal(
    imagePolicy.isCouponImageKey("platform/coupons/../../owners/a.jpg"),
    false
  );
});
