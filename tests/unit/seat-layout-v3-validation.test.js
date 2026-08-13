"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { validateSeatLayoutV3, SeatLayoutV3Error } = require("../../src/domain/seat-layout-v3");
const fixtures = require("../fixtures/seat-layout-v3.fixtures");

const cases = [
  ["standard 2x2 seater", fixtures.standard2x2, 32],
  ["deluxe 2x1 seater", fixtures.deluxe2x1, 21],
  ["mini bus", fixtures.miniBus, 12],
  ["full sleeper", fixtures.fullSleeper, 12],
  ["mixed seater and sleeper", fixtures.mixedSeaterSleeper, 14],
  ["lower seater with upper berths", fixtures.seaterWithUpperBerths, 34],
];

for (const [name, create, expected] of cases) {
  test(`accepts ${name}`, () => {
    const result = validateSeatLayoutV3(create());
    assert.equal(result.totalPlaces, expected);
    assert.equal(result.layout.schemaVersion, 3);
  });
}

test("allows independent lower-cabin and upper-berth dimensions", () => {
  const { layout } = validateSeatLayoutV3(fixtures.seaterWithUpperBerths());
  assert.deepEqual(layout.sections.map(({ widthUnits, heightUnits }) => [widthUnits, heightUnits]), [
    [5, 7], [4, 6],
  ]);
  assert.ok(layout.sections[1].elements.every((element) => element.kind === "BERTH"));
  assert.equal(layout.sections[1].elements.length, 6);
});

function expectInvalid(mutate, path) {
  const value = fixtures.standard2x2();
  mutate(value);
  assert.throws(
    () => validateSeatLayoutV3(value),
    (error) => error instanceof SeatLayoutV3Error && error.details?.path === path
  );
}

test("rejects overlapping elements", () => expectInvalid((value) => {
  value.sections[0].elements[1].position = { ...value.sections[0].elements[0].position };
}, "sections[0].elements[1]"));

test("rejects duplicate passenger labels", () => expectInvalid((value) => {
  value.sections[0].elements[1].label = value.sections[0].elements[0].label;
}, "sections[0].elements[1].label"));

test("rejects duplicate stable element IDs", () => expectInvalid((value) => {
  value.sections[0].elements[1].elementId = value.sections[0].elements[0].elementId;
}, "sections[0].elements[1].elementId"));

test("rejects a one-cell berth", () => expectInvalid((value) => {
  value.sections[0].elements[0].kind = "BERTH";
}, "sections[0].elements[0].size"));

test("rejects an oversized seat", () => expectInvalid((value) => {
  value.sections[0].elements[0].size.height = 2;
}, "sections[0].elements[0].size"));

test("rejects elements outside the section", () => expectInvalid((value) => {
  value.sections[0].elements[0].position.x = value.sections[0].widthUnits;
}, "sections[0].elements[0].position.x"));

test("rejects unknown schema fields", () => expectInvalid((value) => {
  value.rows = 10;
}, "seatLayout.rows"));

test("keeps live availability out of the physical layout contract", () => expectInvalid((value) => {
  value.sections[0].elements[0].isActive = false;
}, "sections[0].elements[0].isActive"));

test("keeps legacy mixed seatType out of the physical contract", () => expectInvalid((value) => {
  value.sections[0].elements[0].seatType = "PRIORITY";
}, "sections[0].elements[0].seatType"));

test("requires contiguous, unambiguous section display order", () => {
  const value = fixtures.fullSleeper();
  value.sections[1].order = 0;
  assert.throws(() => validateSeatLayoutV3(value), SeatLayoutV3Error);
});

test("does not mutate caller input", () => {
  const value = fixtures.standard2x2();
  const before = structuredClone(value);
  validateSeatLayoutV3(value);
  assert.deepEqual(value, before);
});
