"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { mergeSeatState } = require(
  "../../../src/modules/fleet-management/seat-layout-revision.trip-rebase"
);

test("trip rebase preserves retained bookings and initializes added seats", () => {
  const projected = {
    seata: [
      { seatNo: "A1", booked: false, seatClass: "window" },
      { seatNo: "A2", booked: false, seatClass: "aisle" },
    ],
    seatb: [],
    seatc: [],
  };
  const current = [[{
    seatNo: "a1",
    booked: true,
    bookedBy: "user-1",
    bookedAt: new Date("2026-08-12T00:00:00.000Z"),
    blockedFor: "none",
  }], [], []];
  const result = mergeSeatState(projected, current);
  assert.equal(result.seata[0].booked, true);
  assert.equal(result.seata[0].bookedBy, "user-1");
  assert.equal(result.seata[1].booked, false);
});

test("trip rebase clears only layout-owned blocks", () => {
  const projected = { seata: [{ seatNo: "A1", booked: false }], seatb: [], seatc: [] };
  const layoutBlocked = mergeSeatState(projected, [[{
    seatNo: "A1", booked: false, blockedFor: "layout_change",
  }], [], []]);
  const accessibility = mergeSeatState(projected, [[{
    seatNo: "A1", booked: false, blockedFor: "wheelchair",
  }], [], []]);
  assert.equal(layoutBlocked.seata[0].blockedFor, "none");
  assert.equal(accessibility.seata[0].blockedFor, "wheelchair");
});
