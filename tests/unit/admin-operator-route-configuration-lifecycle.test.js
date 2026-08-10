"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Schedule = require("../../models/scheduleModel.js");
const Config = require("../../models/operatorRouteConfigModel.js");
const Variant = require("../../models/routeVariantModel.js");
const RouteStop = require("../../models/routeStopModel.js");
const service = require(
  "../../src/modules/admin/operator-route-configuration/config-lifecycle.service.js"
);

function patch(t, object, key, value) {
  const original = object[key];
  object[key] = value;
  t.after(() => { object[key] = original; });
}

test("active schedules block route configuration edits", async (t) => {
  patch(t, Config, "findById", async () => ({ patternName: "Standard" }));
  patch(t, Schedule, "countDocuments", async () => 2);
  await assert.rejects(
    service.updateConfig("c1", {}),
    (error) => error.statusCode === 409 &&
      /2 ACTIVE schedule\(s\)/.test(error.message)
  );
});

test("any referenced schedule blocks a pattern rename", async (t) => {
  const counts = [0, 3];
  patch(t, Config, "findById", async () => ({ patternName: "Standard" }));
  patch(t, Schedule, "countDocuments", async () => counts.shift());
  await assert.rejects(
    service.updateConfig("c1", { patternName: "Express" }),
    (error) => error.statusCode === 409 &&
      /Cannot rename pattern: 3 schedule\(s\)/.test(error.message)
  );
});

test("timing edits recompute and save the configuration", async (t) => {
  let saved = false;
  const config = {
    patternName: "Standard",
    timingConfig: [],
    async save() { saved = true; },
  };
  patch(t, Config, "findById", async () => config);
  patch(t, Schedule, "countDocuments", async () => 0);
  const result = await service.updateConfig("c1", {
    timingConfig: [
      { estimatedDeparture: "08:00 AM" },
      { estimatedArrival: "10:00 AM" },
    ],
    status: "INACTIVE",
  });
  assert.equal(saved, true);
  assert.equal(result.timingConfig[1].estimatedDeparture, "");
  assert.equal(result.status, undefined);
});

test("active schedules block deactivation", async (t) => {
  patch(t, Config, "findById", async () => ({ status: "ACTIVE" }));
  patch(t, Schedule, "countDocuments", async () => 1);
  await assert.rejects(
    service.toggleConfigStatus("c1"),
    (error) => error.statusCode === 409 &&
      /Cannot deactivate: 1 ACTIVE schedule/.test(error.message)
  );
});

test("inactive configuration becomes active without a schedule query", async (t) => {
  let queried = false;
  let saved = false;
  const config = {
    status: "INACTIVE", variantId: "v1", async save() { saved = true; },
  };
  patch(t, Config, "findById", async () => config);
  patch(t, Schedule, "countDocuments", async () => { queried = true; });
  patch(t, Variant, "findById", () => ({
    select() { return this; },
    lean: async () => ({
      _id: "v1", direction: "FORWARD", status: "ACTIVE",
      originTerminalStopId: "s1", destinationTerminalStopId: "s2",
    }),
  }));
  patch(t, RouteStop, "countDocuments", async () => 2);
  await service.toggleConfigStatus("c1");
  assert.equal(config.status, "ACTIVE");
  assert.equal(saved, true);
  assert.equal(queried, false);
});

test("inactive configuration cannot reactivate on an inactive variant", async (t) => {
  const config = { status: "INACTIVE", variantId: "v1" };
  patch(t, Config, "findById", async () => config);
  patch(t, Variant, "findById", () => ({
    select() { return this; },
    lean: async () => ({
      _id: "v1", direction: "FORWARD", status: "INACTIVE",
      originTerminalStopId: "s1", destinationTerminalStopId: "s2",
    }),
  }));
  await assert.rejects(
    service.toggleConfigStatus("c1"),
    (error) => error.code === "ROUTE_VARIANT_NOT_ACTIVE"
  );
  assert.equal(config.status, "INACTIVE");
});
