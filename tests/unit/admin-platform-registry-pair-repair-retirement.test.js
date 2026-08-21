"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const RouteCorridor = require("../../models/routeCorridorModel.js");
const RouteVariant = require("../../models/routeVariantModel.js");
const { createCompanionFixture } = require("../helpers/registry-companion-fixture.js");
const {
  repairVariantPair,
  retireVariantPair,
} = require("../../src/modules/admin/platform-registry/variant-pair-lifecycle.service.js");

let mongod;
test.before(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
test.after(async () => { await mongoose.disconnect(); await mongod.stop(); });

test("repair links and activates the only reviewed missing direction", async () => {
  const { forward, returning } = await createCompanionFixture("pair-repair");
  const orphanFamilyId = new mongoose.Types.ObjectId();
  await RouteVariant.findByIdAndUpdate(returning._id, {
    status: "DRAFT",
    routeFamilyId: orphanFamilyId,
    returnVariantId: null,
  }, { overwriteImmutable: true });
  forward.returnVariantId = null;
  await forward.save();

  await repairVariantPair(forward._id, null);

  const [repairedForward, repairedReturn] = await Promise.all([
    RouteVariant.findById(forward._id), RouteVariant.findById(returning._id),
  ]);
  assert.equal(repairedReturn.status, "ACTIVE");
  assert.equal(String(repairedReturn.routeFamilyId), String(repairedForward.routeFamilyId));
  assert.equal(String(repairedForward.returnVariantId), String(repairedReturn._id));
  assert.equal(String(repairedReturn.returnVariantId), String(repairedForward._id));
});

test("retire archives both live directions and closes an empty corridor", async () => {
  const { forward, returning } = await createCompanionFixture("pair-retire");
  const result = await retireVariantPair(forward._id, null);
  assert.equal(result.retired, true);
  assert.deepEqual(new Set(result.variantIds), new Set([String(forward._id), String(returning._id)]));
  const archived = await RouteVariant.find({ _id: { $in: [forward._id, returning._id] } });
  assert.ok(archived.every((variant) => variant.status === "ARCHIVED"));
  assert.equal((await RouteCorridor.findById(forward.corridorId)).status, "INACTIVE");
});
