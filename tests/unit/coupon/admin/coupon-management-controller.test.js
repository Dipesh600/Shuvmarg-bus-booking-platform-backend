"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createCouponWriteController,
} = require("../../../../src/modules/coupon/admin/management/coupon-write.controller");

const response = () => {
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
};

const controller = (overrides = {}) =>
  createCouponWriteController({
    creationService: {
      create: async () => ({
        statusCode: 400,
        body: { success: false, message: "Coupon Code is required!" },
      }),
    },
    updateService: { update: async () => ({ statusCode: 200, body: {} }) },
    stateService: {
      remove: async () => ({ statusCode: 200, body: {} }),
      toggle: async () => ({ statusCode: 200, body: {} }),
    },
    isValidId: (id) => id === "valid-id",
    console: { error() {} },
    ...overrides,
  });

test("invalid create request does not require adminInfo before validation", async () => {
  const res = response();
  await controller().createCoupon({ body: {} }, res);
  assert.deepEqual(res.result(), {
    statusCode: 400,
    body: { success: false, message: "Coupon Code is required!" },
  });
});

test("ID validation precedes adminInfo access for update, delete, and toggle", async () => {
  for (const handler of ["updateCoupon", "deleteCoupon", "toggleCouponStatus"]) {
    const res = response();
    await controller()[handler]({ params: { id: "bad" } }, res);
    assert.deepEqual(res.result(), {
      statusCode: 400,
      body: { success: false, message: "Invalid coupon ID format!" },
    });
  }
});

test("unexpected create error preserves exact 500 and log prefix", async () => {
  const logs = [];
  const res = response();
  await controller({
    creationService: {
      create: async () => {
        throw new Error("boom");
      },
    },
    console: { error: (...args) => logs.push(args) },
  }).createCoupon({ body: {}, adminInfo: {} }, res);
  assert.deepEqual(res.result(), {
    statusCode: 500,
    body: { success: false, message: "Internal Server Error!" },
  });
  assert.equal(logs[0][0], "Error creating coupon:");
});
