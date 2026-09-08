"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Config = require("../../models/operatorRouteConfigModel.js");
const Variant = require("../../models/routeVariantModel.js");
const RouteStop = require("../../models/routeStopModel.js");
const Bus = require("../../models/fleetModel.js");
const service = require(
  "../../src/modules/admin/operator-route-configuration/variant-catalog.service.js"
);

function patch(t, object, key, value) {
  const original = object[key];
  object[key] = value;
  t.after(() => { object[key] = original; });
}

function lean(value) {
  return { async lean() { return value; } };
}

function stopQuery(value) {
  return {
    populate() { return this; },
    sort() { return this; },
    async lean() { return value; },
  };
}

function variantQuery(value) {
  return {
    select() { return this; },
    async lean() { return value; },
  };
}

test("fleet-scoped admin catalog exposes only the approved forward corridor", async (t) => {
  let variantFilter = null;
  let patternFilter = null;
  patch(t, Bus, "distinct", async () => { throw new Error("fleet scope must not widen to brand routes"); });
  patch(t, Variant, "find", (filter) => {
    variantFilter = filter;
    return { populate() { return this; }, sort() { return this; }, async lean() { return []; } };
  });
  patch(t, RouteStop, "aggregate", async () => []);
  patch(t, Config, "aggregate", async (pipeline) => { patternFilter = pipeline[0].$match; return []; });
  await service.getAvailableVariantsForOperator("64b000000000000000000001", {
    fleetId: "64b000000000000000000002",
    corridorIds: ["64b000000000000000000003"],
  });
  assert.equal(variantFilter.direction, "FORWARD");
  assert.deepEqual(variantFilter.corridorId.$in, ["64b000000000000000000003"]);
  assert.equal(String(patternFilter.fleetId), "64b000000000000000000002");
});

test("variant stop overlay preserves active, boarding, and timing state",
  async (t) => {
    let configFilter = null;
    patch(t, Config, "findOne", (filter) => {
      configFilter = filter;
      return lean({
      activeStops: ["s1"],
      boardingConfig: [{ stopId: "s1", boardingPointIds: ["p1"] }],
      timingConfig: [{ stopId: "s1", estimatedArrival: "08:00 AM" }],
      });
    });
    patch(t, RouteStop, "find", () => stopQuery([
      { stopId: { _id: "s1" }, sequence: 1 },
      { stopId: { _id: "s2" }, sequence: 2 },
    ]));
    const result = await service.getVariantStopsWithConfig(
      "v1", "b1", "config-from-client"
    );
    assert.equal(result[0].isActive, true);
    assert.deepEqual(result[0].boardingPoints, ["p1"]);
    assert.equal(result[0].timing.estimatedArrival, "08:00 AM");
    assert.equal(result[1].isActive, false);
    assert.deepEqual(result[1].boardingPoints, []);
    assert.equal(result[1].timing, null);
    assert.deepEqual(configFilter, {
      _id: "config-from-client", brandId: "b1", variantId: "v1",
    });
  });

test("variant without a paired return preserves the empty contract", async (t) => {
  patch(t, Variant, "findById", () => variantQuery({
    _id: "v1", returnVariantId: null,
  }));
  assert.deepEqual(
    await service.getReturnVariantStops("v1", "b1"),
    { hasReturnVariant: false, stops: [], returnOverridden: false }
  );
});

test("return overlay defaults all registry stops active", async (t) => {
  patch(t, Variant, "findById", () => variantQuery({
    _id: "v1", returnVariantId: "v2",
  }));
  patch(t, Config, "findOne", () => lean({
    _id: "c1", returnActiveStops: [], returnOverridden: false,
  }));
  patch(t, RouteStop, "find", () => stopQuery([
    { stopId: { _id: "s2" }, sequence: 1 },
  ]));
  const result = await service.getReturnVariantStops("v1", "b1", "c1");
  assert.equal(result.hasReturnVariant, true);
  assert.equal(result.returnVariantId, "v2");
  assert.equal(result.stops[0].isActive, true);
  assert.equal(result.configId, "c1");
});
