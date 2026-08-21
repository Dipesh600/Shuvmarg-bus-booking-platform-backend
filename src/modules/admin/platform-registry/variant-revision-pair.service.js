"use strict";
const RouteVariant = require("../../../../models/routeVariantModel.js");
const { routeVariantError } = require("./route-variant-errors.js");

async function requireActiveCompanion(source, routeFamilyId) {
  let companion = source.returnVariantId ? await RouteVariant.findById(source.returnVariantId) : null;
  const expectedDirection = source.direction === "FORWARD" ? "RETURN" : "FORWARD";
  const validDirectCompanion = companion?.status === "ACTIVE" &&
    companion.direction === expectedDirection &&
    String(companion.corridorId) === String(source.corridorId) &&
    String(companion.routeFamilyId) === String(routeFamilyId);
  if (!validDirectCompanion) companion = null;
  if (!companion) {
    companion = await RouteVariant.findOne({
      corridorId: source.corridorId,
      routeFamilyId,
      direction: expectedDirection,
      status: "ACTIVE",
    });
  }
  if (!companion) {
    throw routeVariantError(
      "ROUTE_FAMILY_ACTIVE_COMPANION_REQUIRED",
      "Repair or activate both directions before starting a new paired revision.", 409
    );
  }
  source.returnVariantId = companion._id;
  companion.returnVariantId = source._id;
  await Promise.all([source.save(), companion.save()]);
  return companion;
}

module.exports = { requireActiveCompanion };
