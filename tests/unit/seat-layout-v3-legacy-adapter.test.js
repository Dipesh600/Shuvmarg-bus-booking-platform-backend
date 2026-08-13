"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { adaptLegacySeatLayout, SeatLayoutV3Error } = require("../../src/domain/seat-layout-v3");

function cell(colIndex, seatId, seatLabel, seatType, isActive = true) {
  return { colIndex, cellType: "SEAT", seatId, seatLabel, seatType, isActive };
}

function legacyDoubleDecker() {
  return {
    busShape: "DOUBLE_DECKER", totalColumns: 5,
    floors: [
      { floorIndex: 0, rows: [{ rowIndex: 0, cells: [
        cell(0, "L-1", "L1", "STANDARD"), cell(1, "L-2", "L2", "STANDARD", false),
      ] }] },
      { floorIndex: 1, rows: [
        { rowIndex: 0, cells: [cell(0, "U-1", "U1", "SLEEPER_UPPER")] },
        { rowIndex: 1, cells: [{ colIndex: 0, cellType: "EMPTY" }] },
      ] },
    ],
  };
}

test("maps a legacy double decker into lower cabin and upper berths", () => {
  const source = legacyDoubleDecker();
  const before = structuredClone(source);
  const result = adaptLegacySeatLayout(source);
  assert.deepEqual(result.layout.sections.map((section) => section.role), [
    "LOWER_CABIN", "UPPER_BERTH_LEVEL",
  ]);
  assert.equal(result.layout.sections[1].elements[0].kind, "BERTH");
  assert.deepEqual(result.layout.sections[1].elements[0].size, { width: 1, height: 2 });
  assert.equal(result.totalPlaces, 3);
  assert.deepEqual(result.initialAvailability, [
    { elementId: "L-1", status: "OPEN" },
    { elementId: "L-2", status: "WITHDRAWN" },
    { elementId: "U-1", status: "OPEN" },
  ]);
  assert.deepEqual(source, before);
});

test("keeps legacy commercial meaning separate from physical form", () => {
  const source = legacyDoubleDecker();
  source.floors[0].rows[0].cells[0].seatType = "PRIORITY";
  const result = adaptLegacySeatLayout(source);
  const seat = result.layout.sections[0].elements[0];
  assert.equal(seat.kind, "SEAT");
  assert.equal(seat.attributes.commercialClass, "PRIORITY");
});

test("fails visibly when a legacy passenger place has no identity or label", () => {
  const source = legacyDoubleDecker();
  source.floors[0].rows[0].cells[0].seatId = null;
  source.floors[0].rows[0].cells[0].seatLabel = null;
  assert.throws(() => adaptLegacySeatLayout(source), SeatLayoutV3Error);
});
