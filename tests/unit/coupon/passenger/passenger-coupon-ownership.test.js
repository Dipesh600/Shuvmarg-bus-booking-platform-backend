"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const passenger = require("../../../../src/modules/coupon/passenger");
const catalog = require("../../../../src/modules/coupon/catalog");

const root = path.resolve(__dirname, "../../../..");

test("passenger coupon module owns all seven user routes", () => {
  assert.deepEqual(Object.keys(passenger), [
    "getAvailableCoupons",
    "validateCoupon",
    "getMyCouponUsage",
    "getBestCoupon",
    "searchCoupons",
    "getAllCouponsForUser",
    "getAllCouponsIncludingExpired",
  ]);
  assert.equal(passenger.getAllCouponsForUser, catalog.getAllCouponsForUser);
  assert.equal(
    passenger.getAllCouponsIncludingExpired,
    catalog.getAllCouponsIncludingExpired
  );
});

test("legacy controller and baseline entry are removed", () => {
  assert.equal(
    fs.existsSync(
      path.join(root, "controllers/couponController/userCouponController.js")
    ),
    false
  );
  const routes = fs.readFileSync(
    path.join(root, "routes/userRoutes/userRoutes.js"),
    "utf8"
  );
  assert.match(routes, /src\/modules\/coupon\/passenger/);
  assert.doesNotMatch(routes, /userCouponController\.js/);
  const baseline = fs.readFileSync(
    path.join(root, "config/refactor-file-size-baseline.json"),
    "utf8"
  );
  assert.doesNotMatch(baseline, /userCouponController/);
});

test("passenger coupon production files stay within 150 lines", () => {
  const directory = path.join(root, "src/modules/coupon/passenger");
  for (const file of fs.readdirSync(directory)) {
    if (!file.endsWith(".js")) continue;
    const lines =
      fs.readFileSync(path.join(directory, file), "utf8").split("\n").length - 1;
    assert.ok(lines <= 150, `${file} has ${lines} lines`);
  }
});
