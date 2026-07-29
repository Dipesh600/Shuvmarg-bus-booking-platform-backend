"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Config = require("../../models/operatorRouteConfigModel.js");
const Variant = require("../../models/routeVariantModel.js");
const RouteStop = require("../../models/routeStopModel.js");
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

test("variant stop overlay preserves active, boarding, and timing state",
  async (t) => {
    patch(t, Config, "findById", () => lean({
      activeStops: ["s1"],
      boardingConfig: [{ stopId: "s1", boardingPointIds: ["p1"] }],
      timingConfig: [{ stopId: "s1", estimatedArrival: "08:00 AM" }],
    }));
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
  patch(t, Config, "findById", () => lean({
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
