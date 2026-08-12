"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createReferenceService } = require("../../services/seatTemplateReferenceService");

const counter = (count) => ({ countDocuments: async () => count });

function service({ fleet = 0, schedule = 0, trip = 0, versions = 1, derived = 0 } = {}) {
  return createReferenceService({
    VersionModel: {
      find: () => ({ distinct: async () => versions ? ["v1"] : [] }),
      countDocuments: async () => versions,
    },
    FleetModel: counter(fleet),
    ScheduleModel: counter(schedule),
    TripModel: counter(trip),
    TemplateModel: counter(derived),
  });
}

test("indirect fleet version references block structural template edits", async () => {
  await assert.rejects(
    () => service({ fleet: 1 }).assertUnreferenced("template", "changed"),
    (error) => error.code === "SEAT_TEMPLATE_IN_USE" && error.details.fleetCount === 1
  );
});

test("immutable version history blocks template deletion", async () => {
  await assert.rejects(
    () => service({ versions: 1 }).assertDeletable("template"),
    (error) => error.code === "SEAT_TEMPLATE_IN_USE" && error.details.versionCount === 1
  );
});

test("a never-versioned and unused template remains deletable", async () => {
  await service({ versions: 0 }).assertDeletable("template");
});
