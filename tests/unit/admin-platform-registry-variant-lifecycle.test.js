"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const RouteVariant = require("../../models/routeVariantModel.js");
const RouteStop = require("../../models/routeStopModel.js");
const Stop = require("../../models/stopModel.js");
const OperatorRouteConfig = require("../../models/operatorRouteConfigModel.js");
const Schedule = require("../../models/scheduleModel.js");
const Trip = require("../../models/tripModel.js");
const Agent = require("../../models/agentModel.js");
const LegacyRouteDiscovery = require("../../models/legacyRouteDiscoveryModel.js");
const registry = require(
  "../../src/modules/admin/platform-registry/route-variant-registry.service.js"
);
const {
  assertVariantCanActivate,
} = require(
  "../../src/modules/admin/platform-registry/variant-activation.policy.js"
);
function patch(t, object, key, value) {
  const original = object[key];
  object[key] = value;
  t.after(() => { object[key] = original; });
}
function query(value) {
  return {
    populate() { return this; },
    sort() { return this; },
    select() { return this; },
    lean: async () => value,
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
  };
}
function activeStop(_id, parentStopId = null) {
  return {
    _id, parentStopId, status: "ACTIVE", verificationStatus: "VERIFIED",
    isRouteStop: true,
  };
}

test("admin variant lists include drafts and inactive variants but exclude archived by default", async (t) => {
  let filter;
  patch(t, RouteVariant, "find", (value) => {
    filter = value;
    return query([]);
  });
  await registry.getVariantsByCorridor("corridor-1");
  assert.deepEqual(filter, {
    corridorId: "corridor-1", status: { $in: ["DRAFT", "ACTIVE", "INACTIVE"] },
  });
  await registry.getVariantsByCorridor("corridor-1", { includeArchived: "true" });
  assert.deepEqual(filter.status.$in, ["DRAFT", "ACTIVE", "INACTIVE", "ARCHIVED"]);
  assert.throws(
    () => registry.parseAdminVariantStatuses({ status: "ARCHIVED" }),
    (error) => error.code === "INVALID_VARIANT_STATUS_FILTER"
  );
});
test("activation accepts active verified route-stop children of directional endpoints", async (t) => {
  const origin = activeStop("origin-child", "origin-parent");
  const destination = activeStop("destination-child", "destination-parent");
  const stops = {
    "origin-child": origin,
    "destination-child": destination,
    "origin-parent": { _id: "origin-parent", status: "ACTIVE", isRouteStop: false },
    "destination-parent": { _id: "destination-parent", status: "ACTIVE", isRouteStop: false },
  };
  patch(t, RouteStop, "find", () => query([
    { stopId: origin._id, sequence: 1, durationFromOriginMins: 0 },
    { stopId: destination._id, sequence: 2, durationFromOriginMins: 60 },
  ]));
  patch(t, Stop, "countDocuments", async () => 2);
  patch(t, Stop, "findById", (id) => query(stops[String(id)] || null));
  await assert.doesNotReject(assertVariantCanActivate({
    _id: "variant-1", name: "Via Highway", direction: "FORWARD",
    originTerminalStopId: origin._id, destinationTerminalStopId: destination._id,
    corridorId: { originId: "origin-parent", destinationId: "destination-parent" },
  }));
});

test("a map-reviewed variant cannot activate without matching selected terminals", async (t) => {
  patch(t, RouteStop, "find", () => query([
    { stopId: "origin", sequence: 1, durationFromOriginMins: 0 },
    { stopId: "destination", sequence: 2, durationFromOriginMins: 60 },
  ]));
  await assert.rejects(
    assertVariantCanActivate({
      _id: "variant-1", name: "Via Highway", direction: "FORWARD",
      definitionSource: "GOOGLE_ROUTE_REVIEW",
      corridorId: { originId: "origin-parent", destinationId: "destination-parent" },
    }),
    (error) => error.code === "VARIANT_TERMINALS_REQUIRED"
  );
});

test("activation rejects a terminal outside the directional endpoint scope", async (t) => {
  patch(t, RouteStop, "find", () => query([
    { stopId: "outside", sequence: 1, durationFromOriginMins: 0 },
    { stopId: "destination", sequence: 2, durationFromOriginMins: 60 },
  ]));
  patch(t, Stop, "countDocuments", async () => 2);
  patch(t, Stop, "findById", (id) => query({
    outside: activeStop("outside", "elsewhere"),
    elsewhere: { _id: "elsewhere", status: "ACTIVE", isRouteStop: false },
    destination: activeStop("destination", "destination-parent"),
    "destination-parent": { _id: "destination-parent", status: "ACTIVE", isRouteStop: false },
  }[String(id)] || null));
  await assert.rejects(
    assertVariantCanActivate({
      _id: "variant-1", name: "Via Highway", direction: "FORWARD",
      corridorId: { originId: "origin-parent", destinationId: "destination-parent" },
    }),
    (error) => error.code === "VARIANT_TERMINAL_OUTSIDE_CORRIDOR_SCOPE"
  );
});

function patchReferenceCounts(t, values = {}) {
  patch(t, RouteStop, "countDocuments", async () => values.routeStopCount || 0);
  patch(t, OperatorRouteConfig, "countDocuments", async () => values.operatorRouteConfigCount || 0);
  patch(t, Schedule, "countDocuments", async () => values.scheduleCount || 0);
  patch(t, Trip, "countDocuments", async () => values.tripCount || 0);
  patch(t, Agent, "countDocuments", async () => values.agentRouteAccessCount || 0);
  patch(t, RouteVariant, "countDocuments", async () => values.linkedVariantCount || 0);
  patch(t, LegacyRouteDiscovery, "countDocuments", async () => values.discoveryPublicationCount || 0);
}

test("deletion protects externally referenced variants and permits only isolated drafts", async (t) => {
  patch(t, RouteVariant, "findById", async () => ({ _id: "variant-1", status: "DRAFT" }));
  patchReferenceCounts(t, { scheduleCount: 1 });
  let deleted = false;
  patch(t, RouteStop, "deleteMany", async () => { deleted = true; });
  await assert.rejects(
    registry.deleteVariant("variant-1"),
    (error) => error.code === "VARIANT_IN_USE" && error.details.scheduleCount === 1
  );
  assert.equal(deleted, false);

  patchReferenceCounts(t);
  patch(t, RouteVariant, "findByIdAndDelete", async () => ({ _id: "variant-1" }));
  await registry.deleteVariant("variant-1");
  assert.equal(deleted, true);
});

test("operational variants cannot be permanently deleted", async (t) => {
  patch(t, RouteVariant, "findById", async () => ({ _id: "variant-1", status: "ACTIVE" }));
  await assert.rejects(
    registry.deleteVariant("variant-1"),
    (error) => error.code === "VARIANT_DELETE_REQUIRES_DRAFT"
  );
});
