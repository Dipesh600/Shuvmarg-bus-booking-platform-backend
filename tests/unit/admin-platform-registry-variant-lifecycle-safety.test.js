const test = require("node:test"), assert = require("node:assert/strict");
const RouteVariant = require("../../models/routeVariantModel.js");
const RouteStop = require("../../models/routeStopModel.js");
const Stop = require("../../models/stopModel.js");
const OperatorRouteConfig = require("../../models/operatorRouteConfigModel.js");
const Schedule = require("../../models/scheduleModel.js");
const Trip = require("../../models/tripModel.js");
const Agent = require("../../models/agentModel.js");
const LegacyRouteDiscovery = require("../../models/legacyRouteDiscoveryModel.js");
const sequenceService = require("../../src/modules/admin/platform-registry/route-stop-sequence.service.js");
const variantService = require("../../src/modules/admin/platform-registry/route-variant-registry.service.js");
const controller = require("../../src/modules/admin/platform-registry/route-variant-registry.controller.js");
const lifecycle = require("../../src/modules/admin/platform-registry/variant-lifecycle.policy.js");
function patch(t, object, key, value) {
  const original = object[key];
  object[key] = value;
  t.after(() => { object[key] = original; });
}
function query(value) {
  return {
    populate() { return this; },
    select() { return this; },
    lean: async () => value,
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
  };
}
function patchReferenceCounts(t, values = {}) {
  patch(t, RouteStop, "countDocuments", async () => values.routeStopCount || 0);
  patch(t, OperatorRouteConfig, "countDocuments", async (filter = {}) => (
    filter.status ? values.activeOperatorRouteConfigCount || 0
      : values.operatorRouteConfigCount || 0
  ));
  patch(t, Schedule, "countDocuments", async (filter = {}) => (
    filter.status ? values.liveScheduleCount || 0 : values.scheduleCount || 0
  ));
  patch(t, Trip, "countDocuments", async (filter = {}) => (
    filter.tripDate ? values.futureTripCount || 0 : values.tripCount || 0
  ));
  patch(t, Agent, "countDocuments", async (filter = {}) => (
    filter.applicationStatus ? values.activeAgentRouteAccessCount || 0
      : values.agentRouteAccessCount || 0
  ));
  patch(t, RouteVariant, "countDocuments", async () => values.linkedVariantCount || 0);
  patch(t, LegacyRouteDiscovery, "countDocuments", async () => values.discoveryPublicationCount || 0);
}
test("live references block retirement but historical references do not", async (t) => {
  patchReferenceCounts(t, { tripCount: 12 });
  await lifecycle.assertVariantStatusTransition(
    { _id: "variant-1", status: "ACTIVE" },
    "INACTIVE"
  );
  patchReferenceCounts(t, { liveScheduleCount: 1 });
  await assert.rejects(
    lifecycle.assertVariantStatusTransition({ _id: "variant-1", status: "ACTIVE" }, "INACTIVE"),
    (error) => error.code === "VARIANT_RETIREMENT_BLOCKED" && error.details.liveScheduleCount === 1
  );
});
test("lifecycle status transitions stay one-way", async (t) => {
  patchReferenceCounts(t);
  await assert.rejects(
    lifecycle.assertVariantStatusTransition({ _id: "variant-1", status: "INACTIVE" }, "DRAFT"),
    (error) => error.code === "INVALID_VARIANT_STATUS_TRANSITION"
  );
});
test("only drafts can change a route definition or replace a route-stop sequence", async (t) => {
  assert.throws(
    () => lifecycle.assertVariantConfigurationMutable({ status: "ACTIVE" }, { name: "Different road" }),
    (error) => error.code === "VARIANT_CONFIGURATION_LOCKED"
  );
  assert.throws(
    () => lifecycle.assertVariantSequenceMutable({ status: "INACTIVE" }),
    (error) => error.code === "VARIANT_SEQUENCE_LOCKED"
  );
  assert.throws(
    () => lifecycle.assertVariantSequenceMutable({
      status: "DRAFT", definitionSource: "GOOGLE_ROUTE_REVIEW",
    }, lifecycle.VARIANT_WRITE_CONTEXT.LEGACY_ADMIN_ENDPOINT),
    (error) => error.code === "VARIANT_DRAFT_WORKFLOW_REQUIRED"
  );
  assert.doesNotThrow(() => lifecycle.assertVariantSequenceMutable({
    status: "DRAFT", definitionSource: "GOOGLE_ROUTE_REVIEW",
  }, lifecycle.VARIANT_WRITE_CONTEXT.INTERNAL_WORKFLOW));
  await assert.rejects(
    variantService.createVariant({ definitionSource: "GOOGLE_ROUTE_REVIEW" }),
    (error) => error.code === "VARIANT_DRAFT_WORKFLOW_REQUIRED"
  );
});
test("legacy sequence endpoint cannot bypass a Google-reviewed draft", async (t) => {
  let stopLookupRan = false;
  patch(t, RouteVariant, "findById", () => query({
    _id: "variant-1", status: "DRAFT", definitionSource: "GOOGLE_ROUTE_REVIEW",
  }));
  patch(t, Stop, "find", async () => { stopLookupRan = true; return []; });
  await assert.rejects(
    sequenceService.setVariantStops("variant-1", [
      { stopCode: "KTM", sequence: 1 }, { stopCode: "MLW", sequence: 2 },
    ], {
      writeContext: lifecycle.VARIANT_WRITE_CONTEXT.LEGACY_ADMIN_ENDPOINT,
    }),
    (error) => error.code === "VARIANT_DRAFT_WORKFLOW_REQUIRED"
  );
  assert.equal(stopLookupRan, false);
});
test("legacy HTTP endpoints pass a non-forgeable direct-write context", async (t) => {
  let updateArguments;
  let sequenceArguments;
  patch(t, variantService, "updateVariant", async (...args) => {
    updateArguments = args;
    return { _id: "variant-1" };
  });
  patch(t, sequenceService, "setVariantStops", async (...args) => {
    sequenceArguments = args;
    return [];
  });
  const response = () => ({
    status() { return this; },
    json() { return this; },
  });
  await controller.updateVariant({
    params: { id: "variant-1" }, body: {}, adminInfo: { id: "admin-1" },
  }, response());
  await controller.setVariantStops({
    params: { variantId: "variant-1" }, body: { stops: [{ stopCode: "KTM", sequence: 1 }] },
  }, response());
  assert.equal(updateArguments[3].writeContext, lifecycle.VARIANT_WRITE_CONTEXT.LEGACY_ADMIN_ENDPOINT);
  assert.equal(sequenceArguments[2].writeContext, lifecycle.VARIANT_WRITE_CONTEXT.LEGACY_ADMIN_ENDPOINT);
});
test("variant service blocks live retirement and direct edits to a map-reviewed draft before writing", async (t) => {
  let writes = 0;
  patchReferenceCounts(t, { liveScheduleCount: 1 });
  patch(t, RouteVariant, "findById", () => query({
    _id: "variant-1", status: "ACTIVE", definitionSource: "ADMIN",
  }));
  patch(t, RouteVariant, "findByIdAndUpdate", async () => { writes += 1; });
  await assert.rejects(
    variantService.updateVariant("variant-1", { status: "INACTIVE" }),
    (error) => error.code === "VARIANT_RETIREMENT_BLOCKED"
  );
  assert.equal(writes, 0);
  patch(t, RouteVariant, "findById", () => query({
    _id: "variant-1", status: "DRAFT", definitionSource: "GOOGLE_ROUTE_REVIEW",
  }));
  await assert.rejects(
    variantService.updateVariant("variant-1", { name: "Manual edit" }, null, {
      writeContext: lifecycle.VARIANT_WRITE_CONTEXT.LEGACY_ADMIN_ENDPOINT,
    }),
    (error) => error.code === "VARIANT_DRAFT_WORKFLOW_REQUIRED"
  );
  assert.equal(writes, 0);
});
