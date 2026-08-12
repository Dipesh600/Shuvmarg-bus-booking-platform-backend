"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { classifyRevision } = require(
  "../../../src/modules/fleet-management/seat-layout-revision.policy"
);

const layout = (cells) => ({
  busShape: "SINGLE_DECKER",
  floors: [{ floorIndex: 0, rows: [{ rowIndex: 0, cells }] }],
});
const seat = (id, label, colIndex, extra = {}) => ({
  colIndex, cellType: "SEAT", seatId: id, seatLabel: label,
  seatType: "STANDARD", ...extra,
});
const now = new Date("2026-08-12T00:00:00.000Z");

test("adding seats is classified for immediate application", () => {
  const current = layout([seat("S1", "1", 0)]);
  const proposed = layout([seat("S1", "1", 0), seat("S2", "2", 1)]);
  const result = classifyRevision(current, proposed, null, now);
  assert.equal(result.classification, "ADDITION_ONLY");
  assert.deepEqual(result.addedSeatIds, ["S2"]);
  assert.equal(result.effectiveAt, now);
});

test("removal, deactivation, movement, relabel, and type changes require review", () => {
  const current = layout([seat("S1", "1", 0), seat("S2", "2", 1)]);
  const proposed = layout([seat("S1", "1A", 2, { seatType: "SEMI_SLEEPER" })]);
  const effectiveAt = new Date("2026-08-20T00:00:00.000Z");
  const result = classifyRevision(current, proposed, effectiveAt, now);
  assert.equal(result.classification, "WITHDRAWAL_OR_MODIFICATION");
  assert.deepEqual(result.removedSeatIds, ["S2"]);
  assert.deepEqual(result.modifiedSeatIds, ["S1"]);
  assert.deepEqual(result.removedSeatLabels.sort(), ["1", "2"]);
});

test("withdrawals require seven full days notice", () => {
  const current = layout([seat("S1", "1", 0), seat("S2", "2", 1)]);
  const proposed = layout([seat("S1", "1", 0)]);
  assert.throws(
    () => classifyRevision(current, proposed, "2026-08-18T23:59:59.000Z", now),
    (error) => error.code === "FLEET_LAYOUT_INVALID"
  );
});
