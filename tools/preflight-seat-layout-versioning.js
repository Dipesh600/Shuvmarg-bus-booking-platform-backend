"use strict";

const { validateSeatLayout } = require("../src/domain/seat-layout/seat-layout.validation");

const id = (value) => String(value?._id || value || "");
const invalidLayouts = (documents) => documents.flatMap((document) => {
  try {
    validateSeatLayout(document.seatConfig);
    return [];
  } catch (error) {
    return [{ id: id(document), reason: error.message }];
  }
});

function buildReport({ templates, fleets, schedules, trips }) {
  const templateVersionsMissing = templates.filter((item) => !item.currentVersionId).map(id);
  const fleetVersionsMissing = fleets.filter((item) => !item.seatLayoutVersionId).map(id);
  const scheduleVersionsMissing = schedules.filter((item) => !item.seatLayoutVersionId).map(id);
  const tripSnapshotsMissing = trips.filter((item) => !item.seatLayoutSnapshot?.fingerprint).map(id);
  const invalid = {
    templates: invalidLayouts(templates),
    fleets: invalidLayouts(fleets),
  };
  const invalidCount = invalid.templates.length + invalid.fleets.length;
  const missingCount = templateVersionsMissing.length + fleetVersionsMissing.length +
    scheduleVersionsMissing.length + tripSnapshotsMissing.length;
  return {
    preflight: "seat-layout-versioning",
    safeForStrictCutover: invalidCount === 0 && missingCount === 0,
    summary: {
      templates: templates.length,
      fleets: fleets.length,
      schedules: schedules.length,
      trips: trips.length,
      invalidLayouts: invalidCount,
      missingVersionOrSnapshot: missingCount,
    },
    missing: {
      templateCurrentVersion: templateVersionsMissing,
      fleetLayoutVersion: fleetVersionsMissing,
      scheduleLayoutVersion: scheduleVersionsMissing,
      tripLayoutSnapshot: tripSnapshotsMissing,
    },
    invalid,
  };
}

async function scan({ SeatTemplate, Fleet, Schedule, Trip }) {
  const [templates, fleets, schedules, trips] = await Promise.all([
    SeatTemplate.find().select("_id seatConfig currentVersionId").lean(),
    Fleet.find().select("_id seatConfig seatLayoutVersionId").lean(),
    Schedule.find().select("_id seatLayoutVersionId").lean(),
    Trip.find().select("_id seatLayoutSnapshot.fingerprint").lean(),
  ]);
  return buildReport({ templates, fleets, schedules, trips });
}

async function main() {
  require("dotenv").config();
  const mongoose = require("mongoose");
  const dbUrl = process.env.MONGODB_URL || process.env.DB_URL;
  if (!dbUrl) throw new Error("MONGODB_URL or DB_URL is required.");
  await mongoose.connect(dbUrl);
  try {
    const report = await scan({
      SeatTemplate: require("../models/seatTemplateModel"),
      Fleet: require("../models/fleetModel"),
      Schedule: require("../models/scheduleModel"),
      Trip: require("../models/tripModel"),
    });
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.safeForStrictCutover ? 0 : 2;
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Seat layout versioning preflight failed:", error.message);
    process.exitCode = 1;
  });
}

module.exports = { buildReport, scan };
