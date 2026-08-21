"use strict";
const OperatorRouteConfig = require("../../../../../models/operatorRouteConfigModel.js");
const Schedule = require("../../../../../models/scheduleModel.js");
const Trip = require("../../../../../models/tripModel.js");
const Agent = require("../../../../../models/agentModel.js");
const LegacyRouteDiscovery = require("../../../../../models/legacyRouteDiscoveryModel.js");
const FleetRouteSetup = require("../../../../../models/fleetRouteSetupModel.js");

async function migrateOperationalReferences(sourceId, targetId, session = null) {
  const options = session ? { session } : {};
  await OperatorRouteConfig.updateMany({ variantId: sourceId }, { $set: { variantId: targetId } }, options);
  await Schedule.updateMany({ variantId: sourceId }, { $set: { variantId: targetId } }, options);
  await Trip.updateMany(
    { variantId: sourceId, status: { $in: ["scheduled", "boarding", "in-transit"] } },
    { $set: { variantId: targetId } }, options
  );
  await Agent.updateMany(
    { allowedRouteIds: sourceId },
    { $set: { "allowedRouteIds.$[elem]": targetId } },
    { ...options, arrayFilters: [{ elem: sourceId }] }
  );
  await LegacyRouteDiscovery.updateMany(
    { "publishedVariant.variantId": sourceId },
    { $set: { "publishedVariant.variantId": targetId } }, options
  );
  await FleetRouteSetup.updateMany({ variantId: sourceId }, { $set: { variantId: targetId } }, options);
  await FleetRouteSetup.updateMany({ returnVariantId: sourceId }, { $set: { returnVariantId: targetId } }, options);
}

module.exports = { migrateOperationalReferences };
