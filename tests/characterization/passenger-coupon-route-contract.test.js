"use strict";

process.env.SECRET_KEY ||= "test-only-secret-32chars-minimum!!";
process.env.VERIFICATION_TOKEN_SECRET ||=
  "test-only-verification-secret!!";

const test = require("node:test");
const assert = require("node:assert/strict");
const routes = require("../../routes/userRoutes/userRoutes");
const auth = require("../../middleware/authMiddleware");
const verifyRoleFromDB = require("../../middleware/verifyRoleFromDB");
const passenger = require("../../src/modules/coupon/passenger");

test("passenger coupon routes preserve exact methods and middleware order", () => {
  const expected = [
    ["get", "/coupons/all", [passenger.getAllCouponsForUser]],
    [
      "get",
      "/coupons/all-with-expired",
      [passenger.getAllCouponsIncludingExpired],
    ],
    [
      "get",
      "/coupons/available",
      [auth, verifyRoleFromDB, passenger.getAvailableCoupons],
    ],
    [
      "post",
      "/coupons/validate",
      [auth, verifyRoleFromDB, passenger.validateCoupon],
    ],
    [
      "get",
      "/coupons/usage-history",
      [auth, verifyRoleFromDB, passenger.getMyCouponUsage],
    ],
    [
      "get",
      "/coupons/best",
      [auth, verifyRoleFromDB, passenger.getBestCoupon],
    ],
    [
      "get",
      "/coupons/search",
      [auth, verifyRoleFromDB, passenger.searchCoupons],
    ],
  ];
  const layers = routes.stack.filter((layer) => layer.route);
  for (const [method, routePath, handlers] of expected) {
    const matches = layers.filter(
      (layer) =>
        layer.route.path === routePath && layer.route.methods[method]
    );
    assert.equal(matches.length, 1, `${method} ${routePath}`);
    assert.deepEqual(
      matches[0].route.stack.map((layer) => layer.handle),
      handlers
    );
  }
});
