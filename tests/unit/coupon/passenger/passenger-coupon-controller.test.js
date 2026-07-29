"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createPassengerCouponController,
} = require(
  "../../../../src/modules/coupon/passenger/passenger-coupon.controller"
);

function response() {
  let statusCode;
  let body;
  return {
    status(code) {
      statusCode = code;
      return this;
    },
    json(value) {
      body = value;
      return this;
    },
    result: () => ({ statusCode, body }),
  };
}

function setup(overrides = {}) {
  const calls = [];
  const ok = async (input) => {
    calls.push(input);
    return { statusCode: 200, body: { success: true } };
  };
  const controller = createPassengerCouponController({
    availability: { getAvailableCoupons: ok, getBestCoupon: ok },
    validateCoupon: ok,
    getCouponHistory: ok,
    searchCoupons: ok,
    console: { error() {} },
    ...overrides,
  });
  return { controller, calls };
}

async function invoke(handler, req) {
  const res = response();
  await handler(req, res);
  return res.result();
}

test("controllers source identity and role only from authenticated context", async () => {
  const { controller, calls } = setup();
  const req = {
    userInfo: { id: "auth-user", activeRole: "passenger" },
    query: { orderAmount: "500", page: "2", limit: "5", query: "sav" },
    body: { couponCode: "SAVE", userId: "client-user" },
  };
  await invoke(controller.getAvailableCoupons, req);
  await invoke(controller.validateCoupon, req);
  await invoke(controller.getMyCouponUsage, req);
  await invoke(controller.getBestCoupon, req);
  await invoke(controller.searchCoupons, req);
  assert.equal(calls[0].userId, "auth-user");
  assert.equal(calls[1].userId, "auth-user");
  assert.equal(calls[1].activeRole, "passenger");
  assert.equal(calls[2].page, "2");
  assert.equal(calls[4].query, "sav");
});

test("controller failures preserve exact generic 500 and log label", async () => {
  const logs = [];
  const { controller } = setup({
    availability: {
      getAvailableCoupons: async () => {
        throw new Error("down");
      },
      getBestCoupon: async () => ({}),
    },
    console: { error: (...args) => logs.push(args) },
  });
  const result = await invoke(controller.getAvailableCoupons, {
    userInfo: { id: "u1" },
    query: {},
  });
  assert.deepEqual(result, {
    statusCode: 500,
    body: { success: false, message: "Internal Server Error!" },
  });
  assert.equal(logs[0][0], "Error fetching available coupons:");
});
