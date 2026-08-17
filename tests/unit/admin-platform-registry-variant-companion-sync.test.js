"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

const RouteCorridor = require("../../models/routeCorridorModel.js");
const RouteVariant = require("../../models/routeVariantModel.js");
const RouteStop = require("../../models/routeStopModel.js");
const Stop = require("../../models/stopModel.js");
const Admin = require("../../models/adminModel.js");
const { createVariantRevision } = require("../../src/modules/admin/platform-registry/variant-revision.service.js");
const { setVariantStops } = require("../../src/modules/admin/platform-registry/route-stop-sequence.service.js");
const { activateVariantDraft } = require("../../src/modules/admin/platform-registry/variant-draft-workflow/commit.service.js");

let mongod;

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

test.after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

test("Reciprocal Stop Sync: editing forward variant updates return variant and activates both", async () => {
  // 1. Create stops: Kathmandu (KTM), Malekhu (MLK), Mugling (MUG), Pokhara (PKR)
  const [ktm, mlk, mug, pkr] = await Stop.create([
    { name: "Kathmandu Terminal", code: "KTM", status: "ACTIVE", verificationStatus: "VERIFIED", isRouteStop: true, type: "CITY" },
    { name: "Malekhu Junction", code: "MLK", status: "ACTIVE", verificationStatus: "VERIFIED", isRouteStop: true, type: "JUNCTION" },
    { name: "Mugling Bazaar", code: "MUG", status: "ACTIVE", verificationStatus: "VERIFIED", isRouteStop: true, type: "TOWN" },
    { name: "Pokhara Terminal", code: "PKR", status: "ACTIVE", verificationStatus: "VERIFIED", isRouteStop: true, type: "CITY" },
  ]);

  // 2. Create corridor
  const corridor = await RouteCorridor.create({
    code: "CR-KTM-PKR",
    originId: ktm._id,
    destinationId: pkr._id,
    status: "ACTIVE",
  });

  // 3. Create active paired variants (Forward and Return)
  const forwardLive = await RouteVariant.create({
    corridorId: corridor._id,
    name: "Kathmandu - Pokhara Express",
    type: "STANDARD",
    direction: "FORWARD",
    originTerminalStopId: ktm._id,
    destinationTerminalStopId: pkr._id,
    distanceKm: 200,
    durationMinutes: 360,
    status: "ACTIVE",
    code: "KTM-PKR-01",
  });

  const returnLive = await RouteVariant.create({
    corridorId: corridor._id,
    name: "Pokhara - Kathmandu Express",
    type: "STANDARD",
    direction: "RETURN",
    originTerminalStopId: pkr._id,
    destinationTerminalStopId: ktm._id,
    distanceKm: 200,
    durationMinutes: 360,
    status: "ACTIVE",
    code: "PKR-KTM-01",
    returnVariantId: forwardLive._id,
  });

  forwardLive.returnVariantId = returnLive._id;
  await forwardLive.save();

  // Initial live stops: KTM -> MUG -> PKR
  await RouteStop.create([
    { variantId: forwardLive._id, stopId: ktm._id, sequence: 1, isMajor: true, distanceFromOriginKm: 0, durationFromOriginMins: 0 },
    { variantId: forwardLive._id, stopId: mug._id, sequence: 2, isMajor: true, distanceFromOriginKm: 110, durationFromOriginMins: 180 },
    { variantId: forwardLive._id, stopId: pkr._id, sequence: 3, isMajor: true, distanceFromOriginKm: 200, durationFromOriginMins: 360 },
  ]);

  await RouteStop.create([
    { variantId: returnLive._id, stopId: pkr._id, sequence: 1, isMajor: true, distanceFromOriginKm: 0, durationFromOriginMins: 0 },
    { variantId: returnLive._id, stopId: mug._id, sequence: 2, isMajor: true, distanceFromOriginKm: 90, durationFromOriginMins: 180 },
    { variantId: returnLive._id, stopId: ktm._id, sequence: 3, isMajor: true, distanceFromOriginKm: 200, durationFromOriginMins: 360 },
  ]);

  // 4. Admin edits forward variant: creates revision
  const revisionDetails = await createVariantRevision(forwardLive._id, null);
  const forwardRevisionId = revisionDetails.variant._id;
  const returnRevisionId = revisionDetails.variant.returnVariantId._id;

  assert.ok(forwardRevisionId, "Forward revision should be created");
  assert.ok(returnRevisionId, "Return revision should be created");

  // 5. Admin adds Malekhu to forward: KTM -> MLK -> MUG -> PKR
  await setVariantStops(forwardRevisionId, [
    { stopCode: "KTM", sequence: 1, isMajor: true },
    { stopCode: "MLK", sequence: 2, isMajor: true },
    { stopCode: "MUG", sequence: 3, isMajor: true },
    { stopCode: "PKR", sequence: 4, isMajor: true },
  ]);

  // Check forward revision stops
  const forwardStops = await RouteStop.find({ variantId: forwardRevisionId }).sort({ sequence: 1 });
  assert.equal(forwardStops.length, 4);
  assert.equal(String(forwardStops[0].stopId), String(ktm._id));
  assert.equal(String(forwardStops[1].stopId), String(mlk._id));
  assert.equal(String(forwardStops[2].stopId), String(mug._id));
  assert.equal(String(forwardStops[3].stopId), String(pkr._id));

  // Verify return revision stops are automatically reversed: PKR -> MUG -> MLK -> KTM
  const returnStops = await RouteStop.find({ variantId: returnRevisionId }).sort({ sequence: 1 });
  assert.equal(returnStops.length, 4, "Return revision should have 4 stops mirrored");
  assert.equal(String(returnStops[0].stopId), String(pkr._id), "Return stop 1 should be PKR");
  assert.equal(String(returnStops[1].stopId), String(mug._id), "Return stop 2 should be MUG");
  assert.equal(String(returnStops[2].stopId), String(mlk._id), "Return stop 3 should be MLK");
  assert.equal(String(returnStops[3].stopId), String(ktm._id), "Return stop 4 should be KTM");

  // 6. Admin activates forward revision
  const activatedForward = await activateVariantDraft(forwardRevisionId, null);
  assert.equal(activatedForward.status, "ACTIVE");

  // Verify return revision was also automatically activated!
  const activatedReturn = await RouteVariant.findById(returnRevisionId);
  assert.equal(activatedReturn.status, "ACTIVE", "Return companion variant should be ACTIVE");

  // Verify old variants are retired to INACTIVE
  const oldForward = await RouteVariant.findById(forwardLive._id);
  const oldReturn = await RouteVariant.findById(returnLive._id);
  assert.equal(oldForward.status, "INACTIVE");
  assert.equal(oldReturn.status, "INACTIVE");
});

test("Reciprocal Stop Sync: editing RETURN variant updates FORWARD variant and activates both", async () => {
  const [ktm, mlk, dum, mug, pkr] = await Stop.create([
    { name: "Kathmandu Terminal 2", code: "KTM2", status: "ACTIVE", verificationStatus: "VERIFIED", isRouteStop: true, type: "CITY" },
    { name: "Malekhu Junction 2", code: "MLK2", status: "ACTIVE", verificationStatus: "VERIFIED", isRouteStop: true, type: "JUNCTION" },
    { name: "Dumre Bazaar 2", code: "DUM2", status: "ACTIVE", verificationStatus: "VERIFIED", isRouteStop: true, type: "TOWN" },
    { name: "Mugling Bazaar 2", code: "MUG2", status: "ACTIVE", verificationStatus: "VERIFIED", isRouteStop: true, type: "TOWN" },
    { name: "Pokhara Terminal 2", code: "PKR2", status: "ACTIVE", verificationStatus: "VERIFIED", isRouteStop: true, type: "CITY" },
  ]);

  const corridor = await RouteCorridor.create({
    code: "CR-KTM2-PKR2",
    originId: ktm._id,
    destinationId: pkr._id,
    status: "ACTIVE",
  });

  const forwardLive = await RouteVariant.create({
    corridorId: corridor._id,
    name: "Kathmandu - Pokhara Express 2",
    type: "STANDARD",
    direction: "FORWARD",
    originTerminalStopId: ktm._id,
    destinationTerminalStopId: pkr._id,
    distanceKm: 200,
    durationMinutes: 360,
    status: "ACTIVE",
    code: "KTM2-PKR2-01",
  });

  const returnLive = await RouteVariant.create({
    corridorId: corridor._id,
    name: "Pokhara - Kathmandu Express 2",
    type: "STANDARD",
    direction: "RETURN",
    originTerminalStopId: pkr._id,
    destinationTerminalStopId: ktm._id,
    distanceKm: 200,
    durationMinutes: 360,
    status: "ACTIVE",
    code: "PKR2-KTM2-01",
    returnVariantId: forwardLive._id,
  });

  forwardLive.returnVariantId = returnLive._id;
  await forwardLive.save();

  await RouteStop.create([
    { variantId: forwardLive._id, stopId: ktm._id, sequence: 1, isMajor: true, distanceFromOriginKm: 0, durationFromOriginMins: 0 },
    { variantId: forwardLive._id, stopId: mug._id, sequence: 2, isMajor: true, distanceFromOriginKm: 110, durationFromOriginMins: 180 },
    { variantId: forwardLive._id, stopId: pkr._id, sequence: 3, isMajor: true, distanceFromOriginKm: 200, durationFromOriginMins: 360 },
  ]);

  await RouteStop.create([
    { variantId: returnLive._id, stopId: pkr._id, sequence: 1, isMajor: true, distanceFromOriginKm: 0, durationFromOriginMins: 0 },
    { variantId: returnLive._id, stopId: mug._id, sequence: 2, isMajor: true, distanceFromOriginKm: 90, durationFromOriginMins: 180 },
    { variantId: returnLive._id, stopId: ktm._id, sequence: 3, isMajor: true, distanceFromOriginKm: 200, durationFromOriginMins: 360 },
  ]);

  // Admin edits RETURN variant: creates revision
  const revisionDetails = await createVariantRevision(returnLive._id, null);
  const returnRevisionId = revisionDetails.variant._id;
  const forwardRevisionId = revisionDetails.variant.returnVariantId._id;

  // Admin adds "Dumre" to RETURN variant: PKR2 -> MUG2 -> DUM2 -> KTM2
  await setVariantStops(returnRevisionId, [
    { stopCode: "PKR2", sequence: 1, isMajor: true },
    { stopCode: "MUG2", sequence: 2, isMajor: true },
    { stopCode: "DUM2", sequence: 3, isMajor: true },
    { stopCode: "KTM2", sequence: 4, isMajor: true },
  ]);

  // Check that forward revision was automatically updated: KTM2 -> DUM2 -> MUG2 -> PKR2
  const forwardStops = await RouteStop.find({ variantId: forwardRevisionId }).sort({ sequence: 1 });
  assert.equal(forwardStops.length, 4, "Forward revision should have 4 stops mirrored");
  assert.equal(String(forwardStops[0].stopId), String(ktm._id), "Forward stop 1 should be KTM2");
  assert.equal(String(forwardStops[1].stopId), String(dum._id), "Forward stop 2 should be DUM2");
  assert.equal(String(forwardStops[2].stopId), String(mug._id), "Forward stop 3 should be MUG2");
  assert.equal(String(forwardStops[3].stopId), String(pkr._id), "Forward stop 4 should be PKR2");

  // Admin activates RETURN revision
  const activatedReturn = await activateVariantDraft(returnRevisionId, null);
  assert.equal(activatedReturn.status, "ACTIVE");

  // Verify FORWARD revision was also activated automatically
  const activatedForward = await RouteVariant.findById(forwardRevisionId);
  assert.equal(activatedForward.status, "ACTIVE", "Forward companion variant should be ACTIVE");
});
