"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const SeatLayoutVersion = require("../../models/seatLayoutVersionModel");
const { createSnapshotService } = require("../../services/seatLayoutSnapshotService");
const { projectLegacySeatArrays } = require(
  "../../src/domain/seat-layout/seat-layout.legacy-projection"
);

const layout = (label = "1") => ({
  busShape: "SINGLE_DECKER",
  floors: [{ floorIndex: 0, rows: [{ rowIndex: 0, cells: [{
    colIndex: 0,
    cellType: "SEAT",
    seatId: `S${label}`,
    seatLabel: label,
    seatType: "STANDARD",
  }] }] }],
});

const query = (value) => ({
  select() { return this; },
  lean: async () => value,
});

test("seat layout version derives immutable canonical metadata", async () => {
  const version = new SeatLayoutVersion({
    templateId: "507f1f77bcf86cd799439011",
    versionNumber: 1,
    seatConfig: layout(),
    totalSeats: 999,
    fingerprint: "caller-value",
  });
  await version.validate();
  assert.equal(version.totalSeats, 1);
  assert.match(version.fingerprint, /^[a-f0-9]{64}$/);
  assert.notEqual(version.fingerprint, "caller-value");
  assert.equal(SeatLayoutVersion.schema.path("seatConfig").options.immutable, true);
});

test("scheduled version wins and produces a detached snapshot", async () => {
  const stored = {
    _id: "version-1",
    versionNumber: 3,
    fingerprint: "fixed-fingerprint",
    seatConfig: layout("A1"),
  };
  const service = createSnapshotService({
    VersionModel: { findById: () => query(stored) },
    BusModel: { findById: () => { throw new Error("fleet fallback should not run"); } },
  });
  const result = await service.resolveForSchedule({ seatLayoutVersionId: "version-1" });
  assert.equal(result.seatLayoutVersionId, "version-1");
  assert.equal(result.seatLayoutSnapshot.versionNumber, 3);
  result.seatLayoutSnapshot.seatConfig.floors[0].rows[0].cells[0].seatLabel = "changed";
  assert.equal(stored.seatConfig.floors[0].rows[0].cells[0].seatLabel, "A1");
});

test("a future version switches only on its effective service date", async () => {
  const versions = {
    current: { _id: "current", versionNumber: 1, fingerprint: "one", seatConfig: layout("A1") },
    next: { _id: "next", versionNumber: 2, fingerprint: "two", seatConfig: layout("A2") },
  };
  const service = createSnapshotService({
    VersionModel: { findById: (id) => query(versions[id]) },
    BusModel: { findById: () => { throw new Error("fleet fallback should not run"); } },
  });
  const schedule = {
    seatLayoutVersionId: "current",
    nextSeatLayoutVersionId: "next",
    seatLayoutEffectiveAt: new Date("2026-08-20T00:00:00.000Z"),
  };
  const before = await service.resolveForSchedule(schedule, new Date("2026-08-19T23:59:59.000Z"));
  const after = await service.resolveForSchedule(schedule, new Date("2026-08-20T00:00:00.000Z"));
  assert.equal(before.seatLayoutVersionId, "current");
  assert.equal(after.seatLayoutVersionId, "next");
});

test("legacy fleet layout remains a controlled migration fallback", async () => {
  const service = createSnapshotService({
    VersionModel: { findById: () => query(null) },
    BusModel: { findById: () => query({ seatLayoutVersionId: null, seatConfig: layout("B1") }) },
  });
  const result = await service.resolveForSchedule({ busId: "fleet-1" });
  assert.equal(result.seatLayoutVersionId, null);
  assert.equal(result.seatLayoutSnapshot.totalSeats, 1);
  assert.equal(result.seatLayoutSnapshot.seatConfig.floors[0].rows[0].cells[0].seatLabel, "B1");
});

test("canonical seat types project into the supported legacy booking classes", () => {
  const projected = projectLegacySeatArrays(layout("C1"));
  assert.equal(projected.seata[0].seatClass, "window");
  const sleeper = layout("L1");
  sleeper.floors[0].rows[0].cells[0].seatType = "SLEEPER_LOWER";
  assert.equal(projectLegacySeatArrays(sleeper).seata[0].seatClass, "lower");
});
