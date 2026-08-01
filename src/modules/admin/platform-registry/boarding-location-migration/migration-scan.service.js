"use strict";

const LegacyPoint = require("../../../../../models/boardingPointsModel.js");
const StopPoint = require("../../../../../models/stopPointModel.js");
const BoardingLocation = require(
  "../../../../../models/boardingLocationModel.js"
);
const Assignment = require(
  "../../../../../models/operatorBoardingAssignmentModel.js"
);
const OperatorBrand = require("../../../../../models/operatorBrandModel.js");
const { buildMigrationCandidate } = require("./migration-candidate.js");
const { buildMigrationPlan } = require("./migration-plan.js");
const {
  buildBoardingLocationIndexPlan,
} = require("./migration-index-plan.js");

const STOP_FIELDS = "name code coordinates status isRouteStop";

async function loadLegacyRecords(Model) {
  return Model.find({}).populate("stopId", STOP_FIELDS).lean();
}

function createCandidates(records, legacyModel, invalidRecords) {
  const candidates = [];
  for (const record of records) {
    try {
      candidates.push(buildMigrationCandidate(record, legacyModel));
    } catch (error) {
      invalidRecords.push({
        legacyKey: `${legacyModel}:${record._id}`,
        code: error.code || "INVALID_LEGACY_BOARDING_LOCATION",
        message: error.message,
      });
    }
  }
  return candidates;
}

async function scanBoardingLocationMigration() {
  const [stopPoints, legacyPoints, locations, assignments, brands, indexPlan] =
    await Promise.all([
      loadLegacyRecords(StopPoint),
      loadLegacyRecords(LegacyPoint),
      BoardingLocation.find({}).lean(),
      Assignment.find({}).lean(),
      OperatorBrand.find({}).select("ownerId").lean(),
      buildBoardingLocationIndexPlan(),
    ]);
  const invalidRecords = [];
  const candidates = [
    ...createCandidates(stopPoints, "StopPoint", invalidRecords),
    ...createCandidates(legacyPoints, "BoardingPoints", invalidRecords),
  ];
  const plan = buildMigrationPlan({
    candidates, locations, assignments, brands,
  });
  plan.invalidRecords.unshift(...invalidRecords);
  plan.safeToApply = plan.safeToApply && invalidRecords.length === 0 &&
    indexPlan.invalid.length === 0;
  return {
    scanned: stopPoints.length + legacyPoints.length,
    legacyCounts: {
      stopPoints: stopPoints.length,
      boardingPoints: legacyPoints.length,
    },
    plan,
    indexPlan,
  };
}

module.exports = { scanBoardingLocationMigration };
