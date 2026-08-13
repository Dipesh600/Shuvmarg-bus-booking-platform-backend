"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { planLegacySeatLayoutMigration } = require("../../src/modules/seat-layout-v3-persistence/seat-layout-migration.planner");
const { resolveSeatLayoutRead } = require("../../src/modules/seat-layout-v3-persistence/seat-layout-read-compatibility.resolver");

const validLegacy = {
  busShape: "SINGLE_DECKER",
  floors: [{ floorIndex: 0, rows: [{ rowIndex: 0, cells: [
    { colIndex: 0, cellType: "SEAT", seatId: "A1", seatLabel: "A1", isActive: true },
  ] }] }],
};

test("migration planner reports ready and blocked records without writing", () => {
  const result = planLegacySeatLayoutMigration([
    { _id: "fleet-1", sourceType: "FLEET", seatConfig: validLegacy },
    { _id: "fleet-2", sourceType: "FLEET", seatConfig: { floors: [] } },
  ]);
  assert.deepEqual({ scanned: result.scanned, ready: result.ready, blocked: result.blocked }, {
    scanned: 2, ready: 1, blocked: 1,
  });
  assert.equal(result.plans[0].initialAvailability[0].status, "OPEN");
  assert.match(result.plans[0].physicalFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(result.plans[1].error.code, "SEAT_LAYOUT_V3_INVALID");
});

test("read resolver prefers immutable trip snapshot over mutable sources", () => {
  const snapshot = { layout: { schemaVersion: 3 }, placeStates: [], pricing: { defaultFare: 1000 } };
  const result = resolveSeatLayoutRead({
    snapshot,
    trip: { seatTemplateId: { seatConfig: { legacy: "template" } }, busId: { seatConfig: { legacy: "bus" } } },
  });
  assert.equal(result.source, "TRIP_V3_SNAPSHOT");
  assert.equal(result.layout.schemaVersion, 3);
});

test("read resolver preserves legacy priority until cutover", () => {
  const result = resolveSeatLayoutRead({
    snapshot: null,
    trip: { seatTemplateId: { seatConfig: { source: "template" } }, busId: { seatConfig: { source: "bus" } } },
  });
  assert.equal(result.source, "LEGACY_V2");
  assert.equal(result.layout.source, "template");
});
