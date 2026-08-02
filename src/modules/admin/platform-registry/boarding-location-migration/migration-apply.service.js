"use strict";

const LegacyPoint = require("../../../../../models/boardingPointsModel.js");
const StopPoint = require("../../../../../models/stopPointModel.js");
const BoardingLocation = require(
  "../../../../../models/boardingLocationModel.js"
);
const Assignment = require(
  "../../../../../models/operatorBoardingAssignmentModel.js"
);
const {
  verifyBoardingLocationIndexes,
} = require("./migration-index.service.js");

async function validateLocationDocuments(locationData) {
  const documents = locationData.map((data) => new BoardingLocation(data));
  await Promise.all(documents.map((document) => document.validate()));
  return documents.map((document) => document.toObject());
}

async function applyBoardingLocationPlan(plan) {
  const locationDocuments = await validateLocationDocuments(
    plan.locationsToCreate
  );
  const locations = locationDocuments.length > 0
    ? await BoardingLocation.insertMany(locationDocuments, { ordered: true })
    : [];
  const assignments = plan.assignmentsToCreate.length > 0
    ? await Assignment.insertMany(plan.assignmentsToCreate, { ordered: true })
    : [];
  return { locationsCreated: locations.length, assignmentsCreated: assignments.length };
}

async function verifyBoardingLocationMigration(scan) {
  const [stopPointCount, boardingPointCount, migratedLocations, assignments,
    indexes] =
    await Promise.all([
      StopPoint.countDocuments({}),
      LegacyPoint.countDocuments({}),
      BoardingLocation.find({ "legacySource.id": { $ne: null } }).lean(),
      Assignment.find({}).lean(),
      verifyBoardingLocationIndexes(),
    ]);
  const errors = [];
  if (stopPointCount !== scan.legacyCounts.stopPoints) {
    errors.push("Legacy StopPoint record count changed during migration.");
  }
  if (boardingPointCount !== scan.legacyCounts.boardingPoints) {
    errors.push("Legacy BoardingPoints record count changed during migration.");
  }
  const locationKeys = new Set(migratedLocations.map((location) =>
    `${location.legacySource.model}:${location.legacySource.id}`
  ));
  const expectedLocationKeys = [
    ...scan.plan.unchanged,
    ...scan.plan.locationsToCreate.map((location) =>
      `${location.legacySource.model}:${location.legacySource.id}`
    ),
  ];
  if (expectedLocationKeys.some((key) => !locationKeys.has(key))) {
    errors.push("Not all planned legacy locations have canonical records.");
  }
  const assignmentKeys = new Set(assignments.map((assignment) =>
    `${assignment.brandId}:${assignment.boardingLocationId}`
  ));
  if (scan.plan.assignmentsToCreate.some((assignment) =>
    !assignmentKeys.has(`${assignment.brandId}:${assignment.boardingLocationId}`)
  )) errors.push("Not all planned operator assignments were created.");
  if (!indexes.passed) errors.push("Required boarding-location indexes are missing.");
  return { passed: errors.length === 0, errors, indexes };
}

module.exports = {
  applyBoardingLocationPlan, verifyBoardingLocationMigration,
};
