"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createRevisionActivationService } = require(
  "../../../src/modules/fleet-management/seat-layout-revision.activation"
);

const leanQuery = (value) => ({ lean: async () => value });

test("activation finishes schedules when the fleet switched on an earlier attempt", async () => {
  const revision = { _id: "r1", fleetId: "f1", toVersionId: "v2" };
  let fleetWrites = 0;
  let scheduleWrites = 0;
  let revisionWrites = 0;
  const service = createRevisionActivationService({
    tripRebase: { applyDue: async () => 1 },
    Revision: {
      find: () => leanQuery([revision]),
      updateOne: async () => { revisionWrites += 1; },
    },
    Version: { findById: () => leanQuery({ _id: "v2", seatConfig: {}, totalSeats: 20 }) },
    Fleet: {
      findById: () => leanQuery({ _id: "f1", seatLayoutVersionId: "v2" }),
      updateOne: async () => { fleetWrites += 1; return { modifiedCount: 0 }; },
    },
    Schedule: { updateMany: async () => { scheduleWrites += 1; } },
  });
  const result = await service.applyDueRevisions(new Date());
  assert.deepEqual(result, { scanned: 1, applied: 1 });
  assert.equal(fleetWrites, 0);
  assert.equal(scheduleWrites, 1);
  assert.equal(revisionWrites, 1);
});

test("activation does not publish a revision when the fleet is not ready", async () => {
  let revisionWrites = 0;
  const service = createRevisionActivationService({
    tripRebase: { applyDue: async () => 0 },
    Revision: {
      find: () => leanQuery([{ _id: "r1", fleetId: "f1", toVersionId: "v2" }]),
      updateOne: async () => { revisionWrites += 1; },
    },
    Version: { findById: () => leanQuery({ _id: "v2", seatConfig: {}, totalSeats: 20 }) },
    Fleet: {
      findById: () => leanQuery({ _id: "f1", seatLayoutVersionId: "v1" }),
      updateOne: async () => ({ modifiedCount: 0 }),
    },
    Schedule: { updateMany: async () => { throw new Error("must not run"); } },
  });
  const result = await service.applyDueRevisions(new Date());
  assert.deepEqual(result, { scanned: 1, applied: 0 });
  assert.equal(revisionWrites, 0);
});
