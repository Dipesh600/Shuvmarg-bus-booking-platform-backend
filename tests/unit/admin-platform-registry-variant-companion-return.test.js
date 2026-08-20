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

test("editing return mirrors stops and activates both variants", async () => {
  const { codes, stops, returning } = await createCompanionFixture("R");
  const details = await createVariantRevision(returning._id, null);
  const returnId = details.variant._id;
  const forwardId = details.variant.returnVariantId._id;
  await setVariantStops(returnId, [codes.PKR, codes.MUG, codes.DUM, codes.KTM].map((stopCode, index) => ({ stopCode, sequence: index + 1, isMajor: true })));
  const mirrored = await RouteStop.find({ variantId: forwardId }).sort({ sequence: 1 });
  assert.deepEqual(mirrored.map((row) => String(row.stopId)), [stops.ktm, stops.dum, stops.mug, stops.pkr].map((stop) => String(stop._id)));
  assert.equal((await activateVariantDraft(returnId, null)).status, "ACTIVE");
  assert.equal((await RouteVariant.findById(forwardId)).status, "ACTIVE");
});
