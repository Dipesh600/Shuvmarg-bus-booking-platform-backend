"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const RouteVariant = require("../../models/routeVariantModel.js");
const { createCompanionFixture } = require("../helpers/registry-companion-fixture.js");
const { createVariantRevision } = require("../../src/modules/admin/platform-registry/variant-revision.service.js");
const { activateVariantDraft } = require("../../src/modules/admin/platform-registry/variant-draft-workflow/commit.service.js");

let mongod;
test.before(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
test.after(async () => { await mongoose.disconnect(); await mongod.stop(); });

test("inactive history cannot start another revision workspace", async () => {
  const { forward } = await createCompanionFixture("inactive-revise");
  await RouteVariant.findByIdAndUpdate(forward._id, { status: "INACTIVE" });
  await assert.rejects(
    () => createVariantRevision(forward._id, null),
    (error) => error.code === "VARIANT_REVISION_REQUIRES_ACTIVE_SOURCE"
  );
  assert.equal(await RouteVariant.countDocuments({ revisionOfVariantId: forward._id }), 0);
});

test("a paired revision cannot start while the active family is incomplete", async () => {
  const { forward, returning } = await createCompanionFixture("incomplete-family");
  await RouteVariant.findByIdAndUpdate(returning._id, { status: "INACTIVE" });
  await assert.rejects(
    () => createVariantRevision(forward._id, null),
    (error) => error.code === "ROUTE_FAMILY_ACTIVE_COMPANION_REQUIRED"
  );
  assert.equal(await RouteVariant.countDocuments({ revisionOfVariantId: forward._id }), 0);
});

test("an unchanged paired revision replaces its own active family without a duplicate conflict", async () => {
  const { forward, returning } = await createCompanionFixture("unchanged-revision");
  const revision = await createVariantRevision(forward._id, null);
  const activated = await activateVariantDraft(revision.variant._id, null);
  const activePair = await RouteVariant.find({
    routeFamilyId: forward.routeFamilyId,
    status: "ACTIVE",
  }).sort({ direction: 1 });
  assert.equal(activated.status, "ACTIVE");
  assert.equal(activePair.length, 2);
  assert.equal((await RouteVariant.findById(forward._id)).status, "INACTIVE");
  assert.equal((await RouteVariant.findById(returning._id)).status, "INACTIVE");
});
