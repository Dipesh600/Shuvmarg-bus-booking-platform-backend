"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Config = require("../../models/operatorRouteConfigModel.js");
const Schedule = require("../../models/scheduleModel.js");
const service = require(
  "../../src/modules/admin/operator-route-configuration/brand-route-services.service.js"
);

function patch(t, object, key, value) {
  const original = object[key];
  object[key] = value;
  t.after(() => { object[key] = original; });
}

function configQuery(value) {
  return {
    populate() { return this; },
    sort() { return this; },
    async lean() { return value; },
  };
}

test("brand route services preserves the empty summary", async (t) => {
  patch(t, Config, "find", () => configQuery([
    { _id: "return-only", variantId: null },
  ]));
  let aggregated = false;
  patch(t, Schedule, "aggregate", async () => { aggregated = true; });
  assert.deepEqual(await service.getBrandRouteServices("b1"), {
    data: [],
    summary: {
      totalRoutes: 0, activeRoutes: 0,
      totalSchedules: 0, activeSchedules: 0,
    },
  });
  assert.equal(aggregated, false);
});

test("brand route services enriches schedule status counts", async (t) => {
  patch(t, Config, "find", () => configQuery([
    { _id: "c1", variantId: { _id: "v1" }, status: "ACTIVE" },
    { _id: "c2", variantId: { _id: "v2" }, status: "INACTIVE" },
  ]));
  patch(t, Schedule, "aggregate", async () => [
    { _id: { configId: "c1", status: "ACTIVE" }, count: 2 },
    { _id: { configId: "c1", status: "DRAFT" }, count: 1 },
    { _id: { configId: "c2", status: "SUSPENDED" }, count: 3 },
  ]);
  const result = await service.getBrandRouteServices("b1");
  assert.deepEqual(result.data[0].scheduleStats, {
    total: 3, active: 2, suspended: 0, draft: 1,
  });
  assert.equal(result.data[0].isLive, true);
  assert.equal(result.data[1].isLive, false);
  assert.deepEqual(result.summary, {
    totalRoutes: 2, activeRoutes: 1,
    totalSchedules: 6, activeSchedules: 2,
  });
});
