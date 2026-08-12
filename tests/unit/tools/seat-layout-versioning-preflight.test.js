"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildReport } = require("../../../tools/preflight-seat-layout-versioning");

const config = {
  busShape: "SINGLE_DECKER",
  floors: [{ floorIndex: 0, rows: [{ rowIndex: 0, cells: [{
    colIndex: 0, cellType: "SEAT", seatId: "S1", seatLabel: "1",
  }] }] }],
};

test("preflight reports every legacy reference without mutating it", () => {
  const input = {
    templates: [{ _id: "t1", seatConfig: config, currentVersionId: null }],
    fleets: [{ _id: "f1", seatConfig: config, seatLayoutVersionId: null }],
    schedules: [{ _id: "s1", seatLayoutVersionId: null }],
    trips: [{ _id: "r1", seatLayoutSnapshot: null }],
  };
  const report = buildReport(input);
  assert.equal(report.safeForStrictCutover, false);
  assert.equal(report.summary.missingVersionOrSnapshot, 4);
  assert.deepEqual(report.missing.templateCurrentVersion, ["t1"]);
  assert.equal(input.templates[0].currentVersionId, null);
});

test("preflight identifies malformed legacy layouts", () => {
  const report = buildReport({
    templates: [{ _id: "t1", seatConfig: {} }],
    fleets: [], schedules: [], trips: [],
  });
  assert.equal(report.summary.invalidLayouts, 1);
  assert.equal(report.invalid.templates[0].id, "t1");
});

test("preflight is safe only after every reference is pinned", () => {
  const report = buildReport({
    templates: [{ _id: "t1", seatConfig: config, currentVersionId: "v1" }],
    fleets: [{ _id: "f1", seatConfig: config, seatLayoutVersionId: "v1" }],
    schedules: [{ _id: "s1", seatLayoutVersionId: "v1" }],
    trips: [{ _id: "r1", seatLayoutSnapshot: { fingerprint: "hash" } }],
  });
  assert.equal(report.safeForStrictCutover, true);
});
