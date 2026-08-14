"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createTripSeatLayoutDualWriteService } = require(
  "../../src/modules/seat-layout-v3-persistence/trip-seat-layout-dual-write.service"
);

function setup(hasAssignment = true) {
  const events = [];
  const session = { id: "session" };
  const repository = {
    runTransaction: async (work) => { events.push("transaction"); return work(session); },
    createTrip: async (input, actual) => { events.push("trip"); assert.equal(actual, session); return { _id: "trip-1", ...input }; },
    createLegacySeats: async (input, actual) => { events.push("legacy"); assert.equal(actual, session); return input; },
    hasV3Assignment: async (fleetId, actual) => { events.push("assignment"); assert.equal(actual, session); return hasAssignment; },
  };
  const snapshots = {
    capture: async (tripId, options) => { events.push("snapshot"); return { tripId, options }; },
  };
  return { events, repository, snapshots };
}

function input() {
  return {
    trip: { busId: "fleet-1" }, legacySeats: { seata: [], seatb: [], seatc: [] },
    defaultFare: null, unavailableElementIds: ["A1"], fareOverrides: [],
  };
}

test("trip creation dual-writes legacy inventory and immutable V3 snapshot atomically", async () => {
  const value = setup(true);
  const result = await createTripSeatLayoutDualWriteService(value.repository, value.snapshots).createTrip(input());
  assert.deepEqual(value.events, ["transaction", "trip", "legacy", "assignment", "snapshot"]);
  assert.equal(result.snapshot.tripId, "trip-1");
  assert.equal(result.snapshot.options.session.id, "session");
  assert.equal(result.snapshot.options.pricing.defaultFare, null);
});

test("legacy fleets remain compatible without manufacturing a V3 snapshot", async () => {
  const value = setup(false);
  const result = await createTripSeatLayoutDualWriteService(value.repository, value.snapshots).createTrip(input());
  assert.deepEqual(value.events, ["transaction", "trip", "legacy", "assignment"]);
  assert.equal(result.snapshot, null);
});

test("snapshot failure rejects the whole transactional operation", async () => {
  const value = setup(true);
  value.snapshots.capture = async () => { throw new Error("snapshot failed"); };
  await assert.rejects(
    createTripSeatLayoutDualWriteService(value.repository, value.snapshots).createTrip(input()),
    /snapshot failed/
  );
});
