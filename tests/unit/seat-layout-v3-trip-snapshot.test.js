"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createTripSeatLayoutSnapshotService } = require("../../src/modules/seat-layout-v3-persistence/trip-seat-layout-snapshot.service");
const fixtures = require("../fixtures/seat-layout-v3.fixtures");

function repository(layout = fixtures.deluxe2x1()) {
  let snapshot = null;
  return {
    findTrip: async () => ({ _id: "trip-1", busId: "fleet-1" }),
    findSnapshot: async () => snapshot,
    findAssignment: async () => ({ activeRevisionId: "rev-1", assignmentVersion: 3 }),
    findRevision: async () => ({
      _id: "rev-1", templateId: "template-1", status: "PUBLISHED", layout,
    }),
    createSnapshot: async (data) => { snapshot = structuredClone(data); return snapshot; },
  };
}

test("trip captures independent layout, availability and default fare", async () => {
  const repo = repository();
  const snapshot = await createTripSeatLayoutSnapshotService(repo).capture("trip-1", {
    unavailableElementIds: ["D-1"],
    pricing: { defaultFare: 1200, overrides: [{ elementId: "D-2", fare: 1500 }] },
  });
  assert.equal(snapshot.sourceAssignmentVersion, 3);
  assert.equal(snapshot.layout.schemaVersion, 3);
  assert.equal(snapshot.placeStates.length, 21);
  assert.deepEqual(snapshot.placeStates[0], { elementId: "D-1", state: "WITHDRAWN" });
  assert.deepEqual(snapshot.pricing.overrides, [{ elementId: "D-2", fare: 1500 }]);
  assert.equal(snapshot.pricing.status, "PRICED");
});

test("missing trip fare is explicit rather than silently stored as zero", async () => {
  const snapshot = await createTripSeatLayoutSnapshotService(repository()).capture("trip-1", {});
  assert.deepEqual(snapshot.pricing, {
    currency: "NPR", status: "UNPRICED", defaultFare: null, overrides: [],
  });
});

test("later source-layout mutation cannot alter captured snapshot", async () => {
  const layout = fixtures.miniBus();
  const repo = repository(layout);
  const snapshot = await createTripSeatLayoutSnapshotService(repo).capture("trip-1", {
    pricing: { defaultFare: 700 },
  });
  layout.sections[0].elements[0].label = "CHANGED";
  assert.equal(snapshot.layout.sections[0].elements[0].label, "M1");
});

test("same trip cannot capture twice", async () => {
  const repo = repository();
  const service = createTripSeatLayoutSnapshotService(repo);
  await service.capture("trip-1", { pricing: { defaultFare: 1000 } });
  await assert.rejects(
    service.capture("trip-1", { pricing: { defaultFare: 1000 } }),
    (error) => error.code === "TRIP_SEAT_LAYOUT_ALREADY_CAPTURED"
  );
});

test("fleet may keep generating trips from its retired but still assigned revision", async () => {
  const repo = repository();
  repo.findRevision = async () => ({
    _id: "rev-1", templateId: "template-1", status: "RETIRED", layout: fixtures.deluxe2x1(),
  });
  const snapshot = await createTripSeatLayoutSnapshotService(repo).capture("trip-1", {
    pricing: { defaultFare: 1000 },
  });
  assert.equal(snapshot.revisionId, "rev-1");
});

test("fare overrides must target unique passenger places", async () => {
  const service = createTripSeatLayoutSnapshotService(repository());
  await assert.rejects(
    service.capture("trip-1", {
      pricing: { defaultFare: 1000, overrides: [{ elementId: "missing", fare: 1200 }] },
    }),
    (error) => error.code === "SEAT_LAYOUT_FARE_OVERRIDE_INVALID"
  );
});

test("withdrawn IDs must exist and be unique", async () => {
  const service = createTripSeatLayoutSnapshotService(repository());
  await assert.rejects(
    service.capture("trip-1", {
      unavailableElementIds: ["D-1", "D-1"], pricing: { defaultFare: 1000 },
    }),
    (error) => error.code === "SEAT_LAYOUT_AVAILABILITY_INVALID"
  );
});
