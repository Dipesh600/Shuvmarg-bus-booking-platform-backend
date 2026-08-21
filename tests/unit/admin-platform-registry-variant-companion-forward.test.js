"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const RouteVariant = require("../../models/routeVariantModel.js");
const RouteStop = require("../../models/routeStopModel.js");
const OperatorRouteConfig = require("../../models/operatorRouteConfigModel.js");
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

test("paired activation repairs missing derived metadata before changing either status", async () => {
  const { codes, forward } = await createCompanionFixture("missing-name");
  const details = await createVariantRevision(forward._id, null);
  const forwardId = details.variant._id;
  const returnId = details.variant.returnVariantId._id;
  await RouteVariant.findByIdAndUpdate(returnId, { $unset: { name: 1 } });
  await setVariantStops(forwardId, [codes.KTM, codes.MUG, codes.PKR].map((stopCode, index) => ({
    stopCode, sequence: index + 1, isMajor: true,
  })));

  const activated = await activateVariantDraft(forwardId, null);
  const returning = await RouteVariant.findById(returnId);
  assert.equal(activated.status, "ACTIVE");
  assert.equal(returning.status, "ACTIVE");
  assert.equal(returning.name, activated.name);
});

test("paired activation preflights the companion before activating the selected draft", async () => {
  const { codes, forward } = await createCompanionFixture("invalid-return");
  const details = await createVariantRevision(forward._id, null);
  const forwardId = details.variant._id;
  const returnId = details.variant.returnVariantId._id;
  await setVariantStops(forwardId, [codes.KTM, codes.MUG, codes.PKR].map((stopCode, index) => ({
    stopCode, sequence: index + 1, isMajor: true,
  })));
  await RouteStop.deleteMany({ variantId: returnId });

  await assert.rejects(
    () => activateVariantDraft(forwardId, null),
    (error) => error.code === "VARIANT_NOT_READY"
  );
  assert.equal((await RouteVariant.findById(forwardId)).status, "DRAFT");
  assert.equal((await RouteVariant.findById(returnId)).status, "DRAFT");
});

test("a failed operational migration rolls back the complete route family", async () => {
  const { codes, forward, returning } = await createCompanionFixture("migration-failure");
  const details = await createVariantRevision(forward._id, null);
  const forwardId = details.variant._id;
  const returnId = details.variant.returnVariantId._id;
  await setVariantStops(forwardId, [codes.KTM, codes.MUG, codes.PKR].map((stopCode, index) => ({
    stopCode, sequence: index + 1, isMajor: true,
  })));

  const originalUpdateMany = OperatorRouteConfig.updateMany;
  OperatorRouteConfig.updateMany = async () => { throw new Error("migration unavailable"); };
  try {
    await assert.rejects(() => activateVariantDraft(forwardId, null), /migration unavailable/);
  } finally {
    OperatorRouteConfig.updateMany = originalUpdateMany;
  }

  assert.equal((await RouteVariant.findById(forwardId)).status, "DRAFT");
  assert.equal((await RouteVariant.findById(returnId)).status, "DRAFT");
  assert.equal((await RouteVariant.findById(forward._id)).status, "ACTIVE");
  assert.equal((await RouteVariant.findById(returning._id)).status, "ACTIVE");
});

test("activation safely completes a legacy route family whose companion is already active", async () => {
  const { codes, forward, returning } = await createCompanionFixture("partial-recovery");
  await RouteVariant.findByIdAndUpdate(forward._id, {
    status: "DRAFT",
    returnVariantId: returning._id,
    $unset: { name: 1 },
  });
  await RouteVariant.findByIdAndUpdate(returning._id, {
    status: "ACTIVE",
    returnVariantId: forward._id,
  });
  await setVariantStops(forward._id, [codes.KTM, codes.MUG, codes.PKR].map((stopCode, index) => ({
    stopCode, sequence: index + 1, isMajor: true,
  })));

  const activated = await activateVariantDraft(forward._id, null);
  const recoveredForward = await RouteVariant.findById(forward._id);
  const untouchedReturn = await RouteVariant.findById(returning._id);
  assert.equal(activated.status, "ACTIVE");
  assert.equal(activated.companionVariant.status, "ACTIVE");
  assert.equal(recoveredForward.name, untouchedReturn.name);
  assert.equal(String(recoveredForward.returnVariantId), String(untouchedReturn._id));
  assert.equal(String(untouchedReturn.returnVariantId), String(recoveredForward._id));
});
