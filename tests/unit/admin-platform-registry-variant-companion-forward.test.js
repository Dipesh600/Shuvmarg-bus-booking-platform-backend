"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const RouteVariant = require("../../models/routeVariantModel.js");
const RouteStop = require("../../models/routeStopModel.js");
const { createCompanionFixture } = require("../helpers/registry-companion-fixture.js");
const { createVariantRevision } = require("../../src/modules/admin/platform-registry/variant-revision.service.js");
const { setVariantStops } = require("../../src/modules/admin/platform-registry/route-stop-sequence.service.js");
const { activateVariantDraft } = require("../../src/modules/admin/platform-registry/variant-draft-workflow/commit.service.js");
let mongod;
test.before(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
test.after(async () => { await mongoose.disconnect(); await mongod.stop(); });

test("editing forward mirrors stops and activates both variants", async () => {
  const { codes, stops, forward, returning } = await createCompanionFixture("F");
  const details = await createVariantRevision(forward._id, null);
  const forwardId = details.variant._id;
  const returnId = details.variant.returnVariantId._id;
  await setVariantStops(forwardId, [codes.KTM, codes.MLK, codes.MUG, codes.PKR].map((stopCode, index) => ({ stopCode, sequence: index + 1, isMajor: true })));
  const mirrored = await RouteStop.find({ variantId: returnId }).sort({ sequence: 1 });
  assert.deepEqual(mirrored.map((row) => String(row.stopId)), [stops.pkr, stops.mug, stops.mlk, stops.ktm].map((stop) => String(stop._id)));
  assert.equal((await activateVariantDraft(forwardId, null)).status, "ACTIVE");
  assert.equal((await RouteVariant.findById(returnId)).status, "ACTIVE");
  assert.equal((await RouteVariant.findById(forward._id)).status, "INACTIVE");
  assert.equal((await RouteVariant.findById(returning._id)).status, "INACTIVE");
});
