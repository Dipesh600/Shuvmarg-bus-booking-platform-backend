"use strict";

const RouteVariant = require("../../../../models/routeVariantModel.js");
const { getCorridorById, activateCorridorIfReady } = require("./corridor-registry.service.js");
const { assertVariantCanActivate } = require("./variant-activation.policy.js");
const { routeVariantError } = require("./route-variant-errors.js");
const { allocateVariantCode } = require("./variant-code-allocation.service.js");
const { assertVariantTerminalScope } = require("./variant-terminal-scope.policy.js");
const { deleteVariant } = require("./variant-deletion.service.js");
const { assertNoLivePathDuplicate } = require("./variant-path-identity.service.js");
const { VARIANT_WRITE_CONTEXT, assertLegacyVariantCreateAllowed, assertMapReviewEndpointAccess, assertVariantConfigurationMutable, assertVariantStatusTransition } = require("./variant-lifecycle.policy.js");

const ADMIN_VISIBLE_STATUSES = ["DRAFT", "ACTIVE", "INACTIVE"];
async function createVariant(data, adminId) {
  assertLegacyVariantCreateAllowed(data);
  const {
    corridorId, name, type, distanceKm, durationMinutes, direction = "FORWARD",
    originTerminalStopId, destinationTerminalStopId,
    autoGenerateReturn = false,
  } = data;
  const corridor = await getCorridorById(corridorId);
  if (autoGenerateReturn) {
    throw routeVariantError(
      "RETURN_VARIANT_REQUIRES_SEPARATE_DRAFT",
      "Create the reverse-direction variant separately so its physical terminals and timing can be reviewed."
    );
  }
  const hasOriginTerminal = Boolean(originTerminalStopId);
  const hasDestinationTerminal = Boolean(destinationTerminalStopId);
  if (hasOriginTerminal !== hasDestinationTerminal) {
    throw routeVariantError(
      "INCOMPLETE_VARIANT_TERMINALS",
      "A variant must define both physical terminals or neither."
    );
  }
  if (hasOriginTerminal) {
    await assertVariantTerminalScope({
      corridor,
      direction,
      originTerminalStopId,
      destinationTerminalStopId,
    });
  }
  const code = await allocateVariantCode(corridor._id, direction);
  return RouteVariant.create({
    code, corridorId: corridor._id, name, type, distanceKm, durationMinutes,
    direction, originTerminalStopId: originTerminalStopId || null,
    destinationTerminalStopId: destinationTerminalStopId || null,
    definitionSource: "ADMIN",
    createdBy: adminId || null,
  });
}

function parseAdminVariantStatuses({ status, includeArchived } = {}) {
  const requested = Array.isArray(status)
    ? status : String(status || "").split(",");
  const statuses = requested.map((value) => String(value).trim().toUpperCase())
    .filter(Boolean);
  const allowed = includeArchived === "true" || includeArchived === true
    ? [...ADMIN_VISIBLE_STATUSES, "ARCHIVED"] : ADMIN_VISIBLE_STATUSES;
  if (statuses.length === 0) return allowed;
  const invalid = statuses.filter((value) => !allowed.includes(value));
  if (invalid.length > 0) {
    throw routeVariantError(
      "INVALID_VARIANT_STATUS_FILTER",
      `Unsupported variant status filter: ${invalid.join(", ")}.`
    );
  }
  return [...new Set(statuses)];
}

function getVariantsByCorridor(corridorId, filters = {}) {
  return RouteVariant.find({
    corridorId, status: { $in: parseAdminVariantStatuses(filters) },
  })
    .populate({
      path: "corridorId",
      populate: [{ path: "originId" }, { path: "destinationId" }],
    })
    .sort({ direction: 1, createdAt: 1 })
    .lean();
}

async function getVariantById(id, { session = null } = {}) {
  let query = RouteVariant.findById(id).populate({
    path: "corridorId",
    populate: [{ path: "originId" }, { path: "destinationId" }],
  });
  if (session && typeof query.session === "function") query = query.session(session);
  const variant = await query;
  if (!variant) {
    throw routeVariantError("VARIANT_NOT_FOUND", "Route variant not found.", 404);
  }
  return variant;
}

async function updateVariant(
  id, data, adminId = null,
  { writeContext = VARIANT_WRITE_CONTEXT.INTERNAL_WORKFLOW } = {}
) {
  const { name, type, distanceKm, durationMinutes, status } = data;
  const current = await getVariantById(id);
  assertMapReviewEndpointAccess(current, writeContext);
  assertVariantConfigurationMutable(current, data);
  await assertVariantStatusTransition(current, status);
  const candidate = {
    ...(typeof current.toObject === "function" ? current.toObject() : current),
    ...(name !== undefined && { name }),
    ...(type !== undefined && { type }),
    ...(distanceKm !== undefined && { distanceKm }),
    ...(durationMinutes !== undefined && { durationMinutes }),
    ...(status !== undefined && { status }),
  };
  let activationIdentity = null;
  if (status === "ACTIVE") { await assertVariantCanActivate(candidate); activationIdentity = await assertNoLivePathDuplicate(candidate); }
  const variant = await RouteVariant.findByIdAndUpdate(
    id,
    {
      ...(name !== undefined && { name }), ...(type !== undefined && { type }),
      ...(distanceKm !== undefined && { distanceKm }),
      ...(durationMinutes !== undefined && { durationMinutes }),
      ...(status !== undefined && { status }),
      ...(activationIdentity && { pathFingerprint: activationIdentity.fingerprint }),
      ...(adminId && { updatedBy: adminId }),
    },
    { new: true, runValidators: true }
  );
  if (!variant) throw routeVariantError("VARIANT_NOT_FOUND", "Route variant not found.", 404);
  if (status === "ACTIVE") {
    await activateCorridorIfReady(variant.corridorId, adminId);
  }
  return variant;
}
module.exports = {
  createVariant, getVariantsByCorridor, getVariantById,
  updateVariant, deleteVariant, parseAdminVariantStatuses,
};
