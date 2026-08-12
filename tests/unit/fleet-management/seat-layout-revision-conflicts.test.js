"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createConflictService,
  labelVariants,
} = require("../../../src/modules/fleet-management/seat-layout-revision.conflicts");

const tripIds = ["trip-1"];
const trips = { find: () => ({ distinct: async () => tripIds }) };

test("conflict checks cover normalized hold labels and booked seats", async () => {
  const queries = [];
  const service = createConflictService({
    Trip: trips,
    Booking: { countDocuments: async (query) => (queries.push(query), 1) },
    SeatHold: { countDocuments: async (query) => (queries.push(query), 1) },
    Seat: { updateMany: async () => ({}) },
    clock: () => new Date("2026-08-12T00:00:00.000Z"),
  });
  await assert.rejects(
    () => service.assertSeatsClear("fleet-1", new Date(), ["A1"]),
    (error) => error.code === "FLEET_LAYOUT_CHANGE_BLOCKED" &&
      error.details.bookingCount === 1 && error.details.holdCount === 1
  );
  assert.deepEqual(labelVariants(["A1"]), ["A1", "a1"]);
  assert.ok(queries.every((query) => query.seats?.$in?.includes("a1") || query.seatNumbers?.$in?.includes("a1")));
});

test("layout blocks are revision-owned and can be compensated safely", async () => {
  const writes = [];
  const service = createConflictService({
    Trip: trips,
    Booking: { countDocuments: async () => 0 },
    SeatHold: { countDocuments: async () => 0 },
    Seat: { updateMany: async (...args) => writes.push(args) },
  });
  await service.blockSeats(tripIds, ["A1"], "revision-1");
  await service.unblockSeats(tripIds, "revision-1");
  assert.equal(writes.length, 6);
  assert.equal(writes[0][1].$set["seata.$[seat].blockedFor"], "layout_change");
  assert.equal(writes[0][1].$set["seata.$[seat].blockedByLayoutRevisionId"], "revision-1");
  assert.equal(writes[3][2].arrayFilters[0]["seat.blockedByLayoutRevisionId"], "revision-1");
});
