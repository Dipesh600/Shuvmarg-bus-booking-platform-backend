"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const Variant = require("../../models/routeVariantModel.js");
const RouteStop = require("../../models/routeStopModel.js");
const Config = require("../../models/operatorRouteConfigModel.js");
const service = require(
  "../../src/modules/admin/operator-route-configuration/configuration.service.js"
);
function patch(t, object, key, value) {
  const original = object[key];
  object[key] = value;
  t.after(() => { object[key] = original; });
}
function leanQuery(value) {
  return { select() { return this; }, async lean() { return value; } };
}
function activeForwardVariant(overrides = {}) {
  return {
    _id: "v1",
    direction: "FORWARD",
    status: "ACTIVE",
    originTerminalStopId: "s1",
    destinationTerminalStopId: "s2",
    ...overrides,
  };
}
test("upsert rejects missing and return variants", async (t) => {
  await assert.rejects(
    service.upsertOperatorConfig("b1", {}),
    /variantId is required/
  );
  patch(t, Variant, "findById", () => leanQuery({
    _id: "v1", direction: "RETURN", status: "ACTIVE",
    originTerminalStopId: "s1", destinationTerminalStopId: "s2",
  }));
  await assert.rejects(
    service.upsertOperatorConfig("b1", {
      variantId: "v1", patternName: "Standard",
    }),
    /Cannot create a route config for a RETURN variant directly/
  );
});
test("upsert rejects active stops outside the selected variant", async (t) => {
  patch(t, Variant, "findById", () => leanQuery({
    ...activeForwardVariant(),
  }));
  patch(t, RouteStop, "countDocuments", async () => 2);
  patch(t, RouteStop, "find", () => leanQuery([{ stopId: "allowed" }]));
  await assert.rejects(
    service.upsertOperatorConfig("b1", {
      variantId: "v1", activeStops: ["invalid"],
    }),
    /These stops are not part of this variant: invalid/
  );
});
test("upsert derives return direction and marks the first pattern default", async (t) => {
  let query;
  let update;
  let options;
  patch(t, Variant, "findById", () => leanQuery({
    ...activeForwardVariant(), returnVariantId: "v2",
  }));
  patch(t, RouteStop, "countDocuments", async () => 2);
  patch(t, RouteStop, "find", () => leanQuery([
    { stopId: "s1" }, { stopId: "s2" },
  ]));
  patch(t, Config, "countDocuments", async () => 0);
  patch(t, Config, "findOneAndUpdate", async (where, data, opts) => {
    query = where;
    update = data;
    options = opts;
    return data;
  });
  await service.upsertOperatorConfig("b1", {
    variantId: "v1",
    patternName: " Express ",
    activeStops: ["s1", "s2"],
    boardingConfig: [{ stopId: "s1" }, { stopId: "s2" }],
    timingConfig: [
      { stopId: "s1", estimatedDeparture: "08:00 AM" },
      {
        stopId: "s2", estimatedArrival: "10:00 AM",
        haltDuration: 0,
      },
    ],
  });
  assert.deepEqual(query, {
    brandId: "b1", variantId: "v1", patternName: "Express",
  });
  assert.equal(update.isDefault, true);
  assert.deepEqual(update.returnActiveStops, ["s2", "s1"]);
  assert.deepEqual(
    update.returnBoardingConfig,
    [{ stopId: "s2" }, { stopId: "s1" }]
  );
  assert.equal(update.returnOverridden, false);
  assert.equal(update.timingConfig[1].estimatedDeparture, "");
  assert.deepEqual(options, { upsert: true, new: true, runValidators: true });
});
test("explicit return timing remains operator-owned", async (t) => {
  let update;
  patch(t, Variant, "findById", () => leanQuery({
    ...activeForwardVariant(),
  }));
  patch(t, RouteStop, "countDocuments", async () => 2);
  patch(t, Config, "countDocuments", async () => 1);
  patch(t, Config, "findOneAndUpdate", async (_query, data) => {
    update = data;
    return data;
  });
  await service.upsertOperatorConfig("b1", {
    variantId: "v1",
    returnActiveStops: ["r1"],
    returnBoardingConfig: [{ stopId: "r1" }],
    returnTimingConfig: [{ stopId: "r1", estimatedDeparture: "09:00 AM" }],
  });
  assert.equal(update.returnOverridden, true);
  assert.deepEqual(update.returnActiveStops, ["r1"]);
  assert.equal(update.isDefault, false);
});
test("upsert rejects inactive or incomplete variants", async (t) => {
  patch(t, Variant, "findById", () => leanQuery(activeForwardVariant({
    status: "INACTIVE",
  })));
  await assert.rejects(
    service.upsertOperatorConfig("b1", {
      variantId: "v1", patternName: "Standard",
    }),
    (error) => error.code === "ROUTE_VARIANT_NOT_ACTIVE"
  );
  patch(t, Variant, "findById", () => leanQuery(activeForwardVariant({
    originTerminalStopId: null,
  })));
  await assert.rejects(
    service.upsertOperatorConfig("b1", {
      variantId: "v1", patternName: "Standard",
    }),
    (error) => error.code === "ROUTE_VARIANT_TERMINALS_REQUIRED"
  );
});
