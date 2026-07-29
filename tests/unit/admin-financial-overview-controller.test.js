"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createFinancialOverviewController,
} = require("../../src/modules/admin/financial-overview/financial-overview.controller");

function response() {
  return {
    code: null,
    body: null,
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test("controller preserves success status and body", async () => {
  let months;
  const controller = createFinancialOverviewController({
    getOverview: async (value) => {
      months = value;
      return { gbv: { allTime: 10 } };
    },
    logger: { error() {} },
  });
  const res = response();
  await controller({ query: { months: "6" } }, res);
  assert.equal(months, "6");
  assert.equal(res.code, 200);
  assert.deepEqual(res.body, {
    success: true,
    data: { gbv: { allTime: 10 } },
  });
});

test("controller preserves exact failure response and log", async () => {
  let logged;
  const controller = createFinancialOverviewController({
    getOverview: async () => { throw new Error("database failed"); },
    logger: {
      error(message, metadata) { logged = { message, metadata }; },
    },
  });
  const res = response();
  await controller({ query: {} }, res);
  assert.equal(res.code, 500);
  assert.deepEqual(res.body, {
    success: false,
    message: "Internal Server Error",
  });
  assert.deepEqual(logged, {
    message: "financialController: getFinancialOverview error",
    metadata: { error: "database failed" },
  });
});
