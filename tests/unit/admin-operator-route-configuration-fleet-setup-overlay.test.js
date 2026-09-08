"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Config = require("../../models/operatorRouteConfigModel.js");
const FleetRouteSetup = require("../../models/fleetRouteSetupModel.js");
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

function selectable(value) {
  return { select() { return lean(value); } };
}

function stopQuery(value) {
  return {
    populate() { return this; },
    sort() { return this; },
    async lean() { return value; },
  };
}

function routeStops() {
  return [
    { stopId: { _id: "s1", name: "Kathmandu" }, sequence: 1 },
    { stopId: { _id: "s2", name: "Koteshwor" }, sequence: 2 },
    { stopId: { _id: "s3", name: "Malangwa" }, sequence: 3 },
  ];
}

test("fleet-registration served stops prefill first route timing setup", async (t) => {
  patch(t, Config, "findOne", () => lean(null));
  patch(t, FleetRouteSetup, "findOne", () => selectable({
    servedStops: [{ stopId: "s1" }, { stopId: "s3" }],
  }));
  patch(t, RouteStop, "find", () => stopQuery(routeStops()));

  const result = await service.getVariantStopsWithConfig("v1", "b1", {
    fleetId: "fleet-1",
  });

  assert.deepEqual(result.map((stop) => stop.isActive), [true, false, true]);
});

test("saved timing config wins over fleet-registration stop prefill", async (t) => {
  patch(t, Config, "findOne", (query) => {
    if (query.isDefault) return lean(null);
    return lean({ activeStops: ["s2"], timingConfig: [{ stopId: "s2", estimatedArrival: "08:00 AM" }] });
  });
  patch(t, FleetRouteSetup, "findOne", () => selectable({
    servedStops: [{ stopId: "s1" }, { stopId: "s3" }],
  }));
  patch(t, RouteStop, "find", () => stopQuery(routeStops()));

  const result = await service.getVariantStopsWithConfig("v1", "b1", {
    fleetId: "fleet-1",
  });

  assert.deepEqual(result.map((stop) => stop.isActive), [false, true, false]);
  assert.equal(result[1].timing.estimatedArrival, "08:00 AM");
});
