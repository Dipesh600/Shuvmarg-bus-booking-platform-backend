"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Schedule = require("../../models/scheduleModel.js");
const Config = require("../../models/operatorRouteConfigModel.js");
const Variant = require("../../models/routeVariantModel.js");
const RouteStop = require("../../models/routeStopModel.js");
const configuration = require(
  "../../src/modules/admin/operator-route-configuration/configuration.service.js"
);
const lifecycle = require(
  "../../src/modules/admin/operator-route-configuration/config-lifecycle.service.js"
);

function patch(t, object, key, value) {
  const original = object[key];
  object[key] = value;
  t.after(() => { object[key] = original; });
}

function leanQuery(value) {
  return { select() { return this; }, async lean() { return value; } };
}

function stubActiveRoute(t) {
  patch(t, Variant, "findById", () => leanQuery({
    _id: "v1", direction: "FORWARD", status: "ACTIVE",
    originTerminalStopId: "s1", destinationTerminalStopId: "s2",
  }));
  patch(t, RouteStop, "countDocuments", async () => 2);
  patch(t, RouteStop, "find", () => leanQuery([
    { stopId: "s1" }, { stopId: "s2" },
  ]));
}

test("active route setup requires endpoints and complete timings", async (t) => {
  stubActiveRoute(t);
  await assert.rejects(
    configuration.upsertOperatorConfig("b1", {
      variantId: "v1", patternName: "Standard", activeStops: [],
    }),
    /Choose at least the starting and destination stops/
  );
  await assert.rejects(
    configuration.upsertOperatorConfig("b1", {
      variantId: "v1", patternName: "Standard", activeStops: ["s1", "s2"],
      timingConfig: [
        { stopId: "s1", estimatedDeparture: "99:00 AM" },
        { stopId: "s2", estimatedArrival: "10:00 AM" },
      ],
    }),
    /valid 12-hour time/
  );
});

test("configuration edits reject stops outside the selected route", async (t) => {
  let saved = false;
  const config = {
    patternName: "Standard", variantId: "v1", status: "DRAFT",
    activeStops: ["s1"], boardingConfig: [], timingConfig: [],
    returnActiveStops: [], returnBoardingConfig: [], returnTimingConfig: [],
    async save() { saved = true; },
  };
  patch(t, Config, "findById", async () => config);
  patch(t, Schedule, "countDocuments", async () => 0);
  patch(t, Variant, "findById", () => leanQuery({ _id: "v1" }));
  patch(t, RouteStop, "find", () => leanQuery([{ stopId: "s1" }]));
  await assert.rejects(
    lifecycle.updateConfig("c1", { activeStops: ["foreign-stop"] }),
    /outside the selected route/
  );
  assert.equal(saved, false);
});

test("setting a default pattern only changes siblings for the same bus", async (t) => {
  let scope = null;
  patch(t, Config, "findById", () => leanQuery({
    _id: "c1", brandId: "b1", variantId: "v1", fleetId: "f1",
  }));
  patch(t, Config, "updateMany", async (query) => { scope = query; });
  patch(t, Config, "findByIdAndUpdate", () => leanQuery({ _id: "c1" }));
  await lifecycle.setDefaultPattern("b1", "c1");
  assert.equal(scope.fleetId, "f1");
});

test("an incomplete draft cannot bypass validation through activation", async (t) => {
  let saved = false;
  const config = {
    status: "DRAFT", variantId: "v1", activeStops: [],
    boardingConfig: [], timingConfig: [], returnActiveStops: [],
    returnBoardingConfig: [], returnTimingConfig: [],
    async save() { saved = true; },
  };
  stubActiveRoute(t);
  patch(t, Config, "findById", async () => config);
  await assert.rejects(
    lifecycle.toggleConfigStatus("c1"),
    /Choose at least the starting and destination stops/
  );
  assert.equal(saved, false);
});
