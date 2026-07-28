"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const management = require("../../../../src/modules/coupon/admin/management");

const root = path.resolve(__dirname, "../../../..");

test("admin coupon management retires the legacy controller", () => {
  assert.equal(
    fs.existsSync(
      path.join(
        root,
        "controllers/adminController/coupon-controller/adminCouponController.js"
      )
    ),
    false
  );
  const routes = fs.readFileSync(
    path.join(root, "src/modules/coupon/admin/coupon-admin.routes.js"),
    "utf8"
  );
  assert.match(routes, /require\("\.\/management"\)/);
  assert.doesNotMatch(routes, /adminCouponController/);
});

test("management exports exactly the eight retired handlers", () => {
  assert.deepEqual(Object.keys(management).sort(), [
    "createCoupon",
    "deleteCoupon",
    "deleteOrphanedCouponImage",
    "getAllCoupons",
    "getCouponById",
    "toggleCouponStatus",
    "updateCoupon",
    "uploadCouponImage",
  ]);
});

test("existing coupon domains remain independently owned", () => {
  for (const relativePath of [
    "src/modules/coupon/admin/analytics/index.js",
    "src/modules/coupon/admin/statistics/index.js",
    "src/modules/coupon/catalog/index.js",
  ]) {
    assert.equal(fs.existsSync(path.join(root, relativePath)), true);
  }
});

test("all management production files remain at most 150 lines", () => {
  const directory = path.join(root, "src/modules/coupon/admin/management");
  for (const file of fs.readdirSync(directory)) {
    if (!file.endsWith(".js")) continue;
    const lines =
      fs.readFileSync(path.join(directory, file), "utf8").split("\n").length - 1;
    assert.ok(lines <= 150, `${file} exceeds 150 physical lines`);
  }
});
