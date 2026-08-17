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
const OperatorBrand = require("../../models/operatorBrandModel.js");
const OperatorRouteConfig = require("../../models/operatorRouteConfigModel.js");
const FleetRouteSetup = require("../../models/fleetRouteSetupModel.js");
const Fleet = require("../../models/fleetModel.js");
const {
  createVariantRevision,
  getVariantDetails,
  rollbackVariantRevision,
  deleteHistoricalRevision,
} = require("../../src/modules/admin/platform-registry/variant-revision.service.js");
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

test("Scoped Revision History, Referencing Fleets, Rollback, and Deletion", async () => {
  // 1. Create Stops
  const [ktm, mlk, mug, pkr] = await Stop.create([
    { name: "Kathmandu Terminal", code: "KTM_RB", status: "ACTIVE", verificationStatus: "VERIFIED", isRouteStop: true, type: "CITY" },
    { name: "Malekhu Junction", code: "MLK_RB", status: "ACTIVE", verificationStatus: "VERIFIED", isRouteStop: true, type: "JUNCTION" },
    { name: "Mugling Bazaar", code: "MUG_RB", status: "ACTIVE", verificationStatus: "VERIFIED", isRouteStop: true, type: "TOWN" },
    { name: "Pokhara Terminal", code: "PKR_RB", status: "ACTIVE", verificationStatus: "VERIFIED", isRouteStop: true, type: "CITY" },
  ]);

  // 2. Create Corridor
  const corridor = await RouteCorridor.create({
    code: "CR-KTM-PKR-RB",
    originId: ktm._id,
    destinationId: pkr._id,
    status: "ACTIVE",
  });

  // 3. Create initial Active variants (v1): KTM -> PKR (direct)
  const forwardV1 = await RouteVariant.create({
    corridorId: corridor._id,
    name: "Kathmandu - Pokhara Super Express",
    type: "STANDARD",
    direction: "FORWARD",
    originTerminalStopId: ktm._id,
    destinationTerminalStopId: pkr._id,
    distanceKm: 200,
    durationMinutes: 360,
    revisionNumber: 1,
    status: "ACTIVE",
    code: "KTM-PKR-RB-01",
  });

  const returnV1 = await RouteVariant.create({
    corridorId: corridor._id,
    name: "Pokhara - Kathmandu Super Express",
    type: "STANDARD",
    direction: "RETURN",
    originTerminalStopId: pkr._id,
    destinationTerminalStopId: ktm._id,
    distanceKm: 200,
    durationMinutes: 360,
    revisionNumber: 1,
    status: "ACTIVE",
    code: "PKR-KTM-RB-01",
    returnVariantId: forwardV1._id,
  });
  forwardV1.returnVariantId = returnV1._id;
  await forwardV1.save();

  // v1 forward stops: KTM -> PKR (2 stops)
  await RouteStop.create([
    { variantId: forwardV1._id, stopId: ktm._id, sequence: 1, isMajor: true, distanceFromOriginKm: 0, durationFromOriginMins: 0 },
    { variantId: forwardV1._id, stopId: pkr._id, sequence: 2, isMajor: true, distanceFromOriginKm: 200, durationFromOriginMins: 360 },
  ]);

  // v1 return stops: PKR -> KTM
  await RouteStop.create([
    { variantId: returnV1._id, stopId: pkr._id, sequence: 1, isMajor: true, distanceFromOriginKm: 0, durationFromOriginMins: 0 },
    { variantId: returnV1._id, stopId: ktm._id, sequence: 2, isMajor: true, distanceFromOriginKm: 200, durationFromOriginMins: 360 },
  ]);

  // 4. Attach an Operator Brand and Bus Fleet to forwardV1
  const brand = await OperatorBrand.create({
    brandName: "Shajha Yatayat",
    brandCode: "OB-SHAJHA",
    ownerId: new mongoose.Types.ObjectId(),
    contactPhone: "9800000000",
  });

  await OperatorRouteConfig.create({
    brandId: brand._id,
    variantId: forwardV1._id,
    patternName: "Standard",
    status: "ACTIVE",
  });

  // 5. Create Revision v2: adding Malekhu and Mugling: KTM -> MLK -> MUG -> PKR
  const rev2Details = await createVariantRevision(forwardV1._id, null);
  const forwardV2DraftId = rev2Details.variant._id;

  await setVariantStops(forwardV2DraftId, [
    { stopCode: "KTM_RB", sequence: 1, isMajor: true },
    { stopCode: "MLK_RB", sequence: 2, isMajor: true },
    { stopCode: "MUG_RB", sequence: 3, isMajor: true },
    { stopCode: "PKR_RB", sequence: 4, isMajor: true },
  ]);

  const forwardV2Active = await activateVariantDraft(forwardV2DraftId, null);
  assert.equal(forwardV2Active.status, "ACTIVE");
  assert.equal(forwardV2Active.revisionNumber, 2);

  // 6. Check getVariantDetails on active v2:
  // - Must include referencingBrands (Shajha Yatayat migrated!)
  // - Must include revisionHistory (containing v1)
  const v2Details = await getVariantDetails(forwardV2Active._id);
  assert.equal(v2Details.referencingBrands.length, 1);
  assert.equal(v2Details.referencingBrands[0].brandName, "Shajha Yatayat");
  assert.equal(v2Details.revisionHistory.length, 1);
  assert.equal(v2Details.revisionHistory[0].revisionNumber, 1);
  assert.equal(v2Details.revisionHistory[0].stopCount, 2);

  // 7. Test ROLLBACK: Rollback from v2 to v1 (restore 2 stops!)
  const rolledBackDetails = await rollbackVariantRevision(v2Details.revisionHistory[0]._id, null);
  const activeV3 = rolledBackDetails.variant;
  assert.equal(activeV3.status, "ACTIVE");
  assert.equal(activeV3.revisionNumber, 3);
  assert.equal(rolledBackDetails.stops.length, 2, "Stops should be rolled back to v1 (2 stops)");
  assert.equal(rolledBackDetails.stops[0].stopId.code, "KTM_RB");
  assert.equal(rolledBackDetails.stops[1].stopId.code, "PKR_RB");

  // Verify referencing brands migrated to the rolled back active variant (v3)
  assert.equal(rolledBackDetails.referencingBrands.length, 1);
  assert.equal(rolledBackDetails.referencingBrands[0].brandName, "Shajha Yatayat");

  // Verify v1 & v2 are now in revisionHistory
  assert.equal(rolledBackDetails.revisionHistory.length, 2);

  // 8. Test DELETE inactive revision: delete v2
  const deleteResult = await deleteHistoricalRevision(forwardV2Active._id);
  assert.equal(deleteResult.deleted, true);

  const v2Record = await RouteVariant.findById(forwardV2Active._id);
  assert.equal(v2Record, null, "v2 should be permanently deleted");
});
