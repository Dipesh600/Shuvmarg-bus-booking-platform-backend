"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const Stop = require("../../models/stopModel.js");
const Corridor = require("../../models/routeCorridorModel.js");
const Variant = require("../../models/routeVariantModel.js");
const RouteStop = require("../../models/routeStopModel.js");
const corridorService = require(
  "../../src/modules/admin/platform-registry/corridor-registry.service.js"
);
const {
  runCorridorRegistryMigration,
} = require(
  "../../src/modules/admin/platform-registry/corridor-registry-migration.service.js"
);

async function createStop(code, name) {
  return Stop.create({
    code, name, status: "ACTIVE", verificationStatus: "VERIFIED",
    isSearchable: true, isRouteStop: true,
  });
}

test("corridor registry enforces neutral identity, readiness and migration", async () => {
  const server = await MongoMemoryServer.create();
  await mongoose.connect(server.getUri(), { autoIndex: false });
  try {
    const origin = await createStop("KTM", "Kathmandu");
    const destination = await createStop("MLW", "Malangwa");
    const hidden = await Stop.create({
      code: "HID", name: "Hidden", status: "ACTIVE",
      verificationStatus: "VERIFIED", isSearchable: false,
    });
    await Corridor.collection.createIndex(
      { originId: 1, destinationId: 1 },
      { name: "originId_1_destinationId_1", unique: true }
    );

    const dryRun = await runCorridorRegistryMigration({ dryRun: true });
    assert.equal(dryRun.success, true);
    assert.equal(dryRun.report.wouldUpdate, 0);
    await assert.rejects(
      corridorService.createCorridor({
        originStopId: origin._id, destinationStopId: hidden._id,
      }),
      (error) => error.code === "INVALID_CORRIDOR_ENDPOINT"
    );
    await assert.rejects(
      corridorService.createCorridor({
        originStopId: origin._id, destinationStopId: origin._id,
      }),
      (error) => error.code === "SAME_CORRIDOR_ENDPOINT"
    );

    const created = await corridorService.createCorridor({
      originStopId: origin._id, destinationStopId: destination._id,
    }, new mongoose.Types.ObjectId());
    assert.equal(created.status, "PENDING");
    await assert.rejects(
      corridorService.createCorridor({
        originStopId: destination._id, destinationStopId: origin._id,
      }),
      (error) => error.code === "CORRIDOR_PAIR_CONFLICT"
    );
    await assert.rejects(
      corridorService.updateCorridor(created.id, { status: "ACTIVE" }),
      (error) => error.code === "CORRIDOR_NOT_READY"
    );

    const variant = await Variant.create({
      code: "KTM-MLW-V01", corridorId: created.id,
      name: "Via BP Highway", direction: "FORWARD", status: "ACTIVE",
    });
    await RouteStop.create([
      { variantId: variant._id, stopId: origin._id, sequence: 1 },
      { variantId: variant._id, stopId: destination._id, sequence: 2 },
    ]);
    await assert.rejects(
      corridorService.deleteCorridor(created.id),
      (error) => error.code === "CORRIDOR_IN_USE"
    );
    assert.equal(
      await corridorService.activateCorridorIfReady(created.id), true
    );
    assert.equal((await Corridor.findById(created.id)).status, "ACTIVE");
    assert.equal((await corridorService.getAllCorridors({
      status: "ACTIVE", search: "Kathmandu",
    })).length, 1);
    await RouteStop.deleteMany({ variantId: variant._id });
    await Variant.findByIdAndDelete(variant._id);
    await assert.rejects(
      corridorService.deleteCorridor(created.id),
      (error) => error.code === "CORRIDOR_DELETE_REQUIRES_PENDING"
    );
    await corridorService.updateCorridor(created.id, { status: "PENDING" });
    await corridorService.deleteCorridor(created.id);
    assert.equal(await Corridor.countDocuments({ _id: created.id }), 0);

    const sourcedDestination = await createStop("BRJ", "Birgunj");
    const sourcedCorridor = await corridorService.createCorridor({
      originStopId: origin._id,
      destinationStopId: sourcedDestination._id,
      source: "ROUTE_REQUEST",
      sourceReferenceId: String(new mongoose.Types.ObjectId()),
    });
    await assert.rejects(
      corridorService.deleteCorridor(sourcedCorridor.id),
      (error) => error.code === "CORRIDOR_HAS_SOURCE_HISTORY"
    );

    const corridorWithDraft = await corridorService.createCorridor({
      originStopId: origin._id, destinationStopId: destination._id,
    });
    await Variant.create({
      code: "KTM-MLW-V02", corridorId: corridorWithDraft.id,
      name: "Unfinished draft", direction: "FORWARD", status: "DRAFT",
    });
    await assert.rejects(
      corridorService.deleteCorridor(corridorWithDraft.id),
      (error) => error.code === "CORRIDOR_HAS_DRAFT_VARIANTS"
    );

    const first = await runCorridorRegistryMigration();
    assert.equal(first.success, true);
    assert.equal(first.report.verification.passed, true);
    const second = await runCorridorRegistryMigration();
    assert.equal(second.success, true);
    assert.equal(second.report.wouldUpdate, 0);

    await RouteStop.deleteMany({});
    await Variant.deleteMany({});
    await Corridor.deleteMany({});
    await Corridor.collection.insertMany([
      { code: "KTM-MLW", originId: origin._id,
        destinationId: destination._id, status: "ACTIVE" },
      { code: "MLW-KTM", originId: destination._id,
        destinationId: origin._id, status: "ACTIVE" },
    ]);
    const conflict = await runCorridorRegistryMigration();
    assert.equal(conflict.success, false);
    assert.equal(conflict.report.identityConflicts.length, 1);
    assert.equal(await Corridor.countDocuments({}), 2);
  } finally {
    await mongoose.disconnect();
    await server.stop();
  }
});
