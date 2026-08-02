"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const Stop = require("../../../models/stopModel.js");
const StopPoint = require("../../../models/stopPointModel.js");
const LegacyPoint = require("../../../models/boardingPointsModel.js");
const BoardingLocation = require(
  "../../../models/boardingLocationModel.js"
);
const Assignment = require(
  "../../../models/operatorBoardingAssignmentModel.js"
);
const OperatorBrand = require("../../../models/operatorBrandModel.js");
const {
  runBoardingLocationMigration,
} = require(
  "../../../src/modules/admin/platform-registry/boarding-location-migration/boarding-location-migration.service.js"
);

test("migration is additive, skips fallback duplicates, and is idempotent", async () => {
  const server = await MongoMemoryServer.create();
  await mongoose.connect(server.getUri(), { autoIndex: false });
  try {
    const ownerId = new mongoose.Types.ObjectId();
    const stop = await Stop.create({
      code: "MUG", name: "Mugling", isRouteStop: true,
      status: "ACTIVE", verificationStatus: "VERIFIED",
      coordinates: { lat: 27.856, lng: 84.558 },
    });
    await OperatorBrand.create({
      ownerId, brandCode: "OB-TST001", brandName: "Test Travels",
    });
    await StopPoint.create([
      {
        stopId: stop._id, name: "Mugling", source: "DISCOVERY",
        coordinates: stop.coordinates,
      },
      {
        stopId: stop._id, name: "Mugling Bus Park", source: "MANUAL",
        coordinates: { lat: 27.857, lng: 84.559 },
      },
    ]);
    await LegacyPoint.create({
      stopId: stop._id, city: "Mugling", pointName: "Counter 4",
      isGlobal: false, ownerId, type: "BOARDING",
      contactNumber: "9800000000",
      coordinates: { lat: 27.858, lng: 84.56 },
    });

    const dryRun = await runBoardingLocationMigration({ dryRun: true });
    assert.equal(dryRun.success, true);
    assert.equal(dryRun.report.locationsToCreate, 2);
    assert.equal(dryRun.report.assignmentsToCreate, 1);
    assert.equal(dryRun.report.syntheticFallbacksSkipped, 1);
    assert.equal(await BoardingLocation.countDocuments({}), 0);

    const first = await runBoardingLocationMigration();
    assert.equal(first.success, true);
    assert.equal(first.report.applied.locationsCreated, 2);
    assert.equal(first.report.applied.assignmentsCreated, 1);
    assert.ok(first.report.applied.indexes.created.length > 0);
    assert.equal(first.report.verification.indexes.passed, true);
    assert.equal(await StopPoint.countDocuments({}), 2);
    assert.equal(await LegacyPoint.countDocuments({}), 1);
    assert.equal(await BoardingLocation.countDocuments({}), 2);
    assert.equal(await Assignment.countDocuments({ usage: "PICKUP" }), 1);

    const second = await runBoardingLocationMigration();
    assert.equal(second.success, true);
    assert.equal(second.report.locationsToCreate, 0);
    assert.equal(second.report.assignmentsToCreate, 0);
    assert.equal(second.report.unchanged, 2);
    assert.equal(second.report.applied.indexes.created.length, 0);
  } finally {
    await mongoose.disconnect();
    await server.stop();
  }
});
