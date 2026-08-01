"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveBoardingScope } = require(
  "../../../src/modules/booking/passenger-boarding-options/passenger-boarding-options-scope.js"
);

const parentId = "64b000000000000000000001";
const kalankiId = "64b000000000000000000002";
const koteshworId = "64b000000000000000000003";

const activeStop = (id, name, coordinates) => ({
  _id: id, parentStopId: parentId, name, district: "Kathmandu",
  province: "Bagmati", status: "ACTIVE", verificationStatus: "VERIFIED",
  isRouteStop: true, coordinates,
});

test("parent selection exposes only operator-served children with their own times", async () => {
  const parent = {
    _id: parentId, name: "Kathmandu", status: "ACTIVE",
    verificationStatus: "VERIFIED", isSearchable: true,
  };
  const stops = [
    activeStop(kalankiId, "Kalanki", { lat: 27.69, lng: 85.28 }),
    activeStop(koteshworId, "Koteshwor", { lat: 27.68, lng: 85.35 }),
  ];
  const repository = {
    findStops: async (ids) => ids.includes(parentId)
      ? [parent]
      : stops.filter((stop) => ids.includes(stop._id)),
    findChildStops: async () => stops,
    findOperatorAssignments: async () => [],
  };
  const trip = {
    variantId: { direction: "OUTBOUND" },
    scheduleId: { operatorRouteConfigId: { timingConfig: [
      { stopId: kalankiId, estimatedDeparture: "08:00", stopBehavior: "BOTH" },
      { stopId: koteshworId, estimatedDeparture: "08:20", stopBehavior: "BOTH" },
    ] } },
  };
  const result = await resolveBoardingScope({
    repository, trip, brandId: "brand-1", selectedStopId: parentId,
    resolvedStopId: kalankiId, served: new Set([kalankiId, koteshworId]),
    usage: "PICKUP",
  });
  assert.equal(result.isParentSelection, true);
  assert.deepEqual(result.groups.map((group) => group.stopName), ["Kalanki", "Koteshwor"]);
  assert.equal(result.options[1].district, "Kathmandu");
  assert.equal(result.options[1].province, "Bagmati");
  assert.equal(result.options[0].time, "08:00");
  assert.equal(result.options[1].time, "08:20");
  assert.equal(result.options[1].reportingInstructions, null);
});

test("parent selection does not turn unserved children into fallbacks", async () => {
  const parent = {
    _id: parentId, name: "Kathmandu", status: "ACTIVE",
    verificationStatus: "VERIFIED", isSearchable: true, isRouteStop: true,
    coordinates: { lat: 27.71, lng: 85.32 },
  };
  const children = [activeStop(kalankiId, "Kalanki", { lat: 27.69, lng: 85.28 })];
  const repository = {
    findStops: async (ids) => [parent, ...children].filter((stop) => ids.includes(stop._id)),
    findChildStops: async () => children,
    findOperatorAssignments: async () => [],
  };
  const trip = {
    variantId: { direction: "OUTBOUND" },
    scheduleId: { operatorRouteConfigId: { timingConfig: [
      { stopId: parentId, estimatedDeparture: "08:00", stopBehavior: "BOTH" },
    ] } },
  };
  const result = await resolveBoardingScope({
    repository, trip, brandId: "brand-1", selectedStopId: parentId,
    resolvedStopId: parentId, served: new Set([parentId]), usage: "PICKUP",
  });
  assert.deepEqual(result.groups.map((group) => group.stopName), ["Kathmandu"]);
  assert.equal(result.options[0].sourceType, "STOP_FALLBACK");
});

test("served child without its own time is not offered", async () => {
  const parent = {
    _id: parentId, name: "Kathmandu", status: "ACTIVE",
    verificationStatus: "VERIFIED", isSearchable: true,
  };
  const children = [activeStop(kalankiId, "Kalanki", { lat: 27.69, lng: 85.28 })];
  const repository = {
    findStops: async (ids) => ids.includes(parentId) ? [parent] : children,
    findChildStops: async () => children,
    findOperatorAssignments: async () => [],
  };
  await assert.rejects(resolveBoardingScope({
    repository,
    trip: { variantId: { direction: "OUTBOUND" }, scheduleId: {
      operatorRouteConfigId: { timingConfig: [] },
    } },
    brandId: "brand-1", selectedStopId: parentId,
    resolvedStopId: kalankiId, served: new Set([kalankiId]), usage: "PICKUP",
  }), (error) => error.code === "BOARDING_USAGE_NOT_ALLOWED");
});

test("rejects a searched stop that does not contain the resolved route stop", async () => {
  const selected = {
    _id: parentId, name: "Kathmandu", status: "ACTIVE",
    verificationStatus: "VERIFIED", isSearchable: true,
  };
  const repository = {
    findStops: async (ids) => ids.includes(parentId) ? [selected] : [],
    findChildStops: async () => [],
  };
  await assert.rejects(
    resolveBoardingScope({
      repository, trip: {}, brandId: "brand-1", selectedStopId: parentId,
      resolvedStopId: kalankiId, served: new Set([kalankiId]), usage: "PICKUP",
    }),
    (error) => error.code === "INVALID_BOARDING_SELECTION"
  );
});
