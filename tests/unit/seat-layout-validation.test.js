"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { validateSeatLayout } = require("../../src/domain/seat-layout/seat-layout.validation");
const { SeatLayoutError } = require("../../src/domain/seat-layout/seat-layout.error");
const SeatTemplate = require("../../models/seatTemplateModel");

function layout({ shape = "SINGLE_DECKER", floors = 1 } = {}) {
  return {
    busShape: shape,
    floors: Array.from({ length: floors }, (_, floorIndex) => ({
      floorIndex,
      rows: [{
        rowIndex: 0,
        cells: [{
          colIndex: 0, cellType: "SEAT", seatId: `S${floorIndex + 1}`,
          seatLabel: `${floorIndex + 1}`, seatType: "STANDARD",
        }],
      }],
    })),
  };
}

test("validates capacity from physical seat cells", () => {
  const result = validateSeatLayout(layout());
  assert.equal(result.totalSeats, 1);
  assert.equal(result.seatConfig.floors[0].rows[0].cells[0].isActive, true);
});

test("requires two contiguous floors for a double-decker", () => {
  assert.throws(
    () => validateSeatLayout(layout({ shape: "DOUBLE_DECKER" })),
    (error) => error instanceof SeatLayoutError && error.statusCode === 422
  );
  assert.equal(validateSeatLayout(layout({ shape: "DOUBLE_DECKER", floors: 2 })).totalSeats, 2);
});

test("sleeper berths occupy real two-row footprints", () => {
  const value = layout({ shape: "SLEEPER_COACH" });
  value.floors[0].rows.push({ rowIndex: 1, cells: [] });
  Object.assign(value.floors[0].rows[0].cells[0], {
    seatType: "SLEEPER_LOWER", rowSpan: 2, colSpan: 1,
  });
  const result = validateSeatLayout(value);
  assert.equal(result.seatConfig.floors[0].rows[0].cells[0].rowSpan, 2);
  value.floors[0].rows[1].cells.push({
    colIndex: 0, cellType: "SEAT", seatId: "S2", seatLabel: "2", seatType: "STANDARD",
  });
  assert.throws(() => validateSeatLayout(value), /overlaps another seat/);
});

test("rejects a sleeper berth without enough floor space", () => {
  const value = layout({ shape: "SLEEPER_COACH" });
  Object.assign(value.floors[0].rows[0].cells[0], {
    seatType: "SLEEPER_LOWER", rowSpan: 2,
  });
  assert.throws(() => validateSeatLayout(value), /extends beyond the floor/);
});

test("rejects duplicate seat identities and labels", () => {
  const value = layout();
  value.floors[0].rows[0].cells.push({
    colIndex: 1, cellType: "SEAT", seatId: "s1", seatLabel: "2", seatType: "STANDARD",
  });
  assert.throws(() => validateSeatLayout(value), /duplicated/);
  value.floors[0].rows[0].cells[1].seatId = "S2";
  value.floors[0].rows[0].cells[1].seatLabel = "1";
  assert.throws(() => validateSeatLayout(value), /duplicated/);
});

test("rejects duplicate geometry and missing seat labels", () => {
  const value = layout();
  value.floors[0].rows[0].cells[0].seatLabel = "";
  assert.throws(() => validateSeatLayout(value), /seatLabel is required/);
  const duplicated = layout();
  duplicated.floors[0].rows.push({ rowIndex: 0, cells: [] });
  assert.throws(() => validateSeatLayout(duplicated), /rowIndex is duplicated/);
});

test("SeatTemplate model derives capacity and rejects bypass writes", async () => {
  const template = new SeatTemplate({ templateName: "Safe", seatConfig: layout() });
  await template.validate();
  assert.equal(template.totalSeats, 1);
  const invalid = new SeatTemplate({
    templateName: "Unsafe", totalSeats: 40, seatConfig: { busShape: "SINGLE_DECKER" },
  });
  await assert.rejects(() => invalid.validate(), /requires 1 floor level/);
});
