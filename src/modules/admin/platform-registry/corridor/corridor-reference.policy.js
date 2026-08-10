"use strict";

const Bus = require("../../../../../models/fleetModel.js");
const RouteVariant = require("../../../../../models/routeVariantModel.js");
const {
  corridorError,
} = require("../../../../domain/corridor/corridor-errors.js");

async function getCorridorReferenceCounts(corridorId) {
  const [fleetCount, draftVariantCount, operationalVariantCount] = await Promise.all([
    Bus.countDocuments({ corridorId }),
    RouteVariant.countDocuments({ corridorId, status: "DRAFT" }),
    RouteVariant.countDocuments({
      corridorId, status: { $in: ["ACTIVE", "INACTIVE", "ARCHIVED"] },
    }),
  ]);
  return {
    fleetCount,
    draftVariantCount,
    operationalVariantCount,
    variantCount: draftVariantCount + operationalVariantCount,
  };
}

async function assertCorridorCanDelete(corridor) {
  const details = await getCorridorReferenceCounts(corridor._id);
  if (corridor.status !== "PENDING") {
    throw corridorError(
      "CORRIDOR_DELETE_REQUIRES_PENDING",
      "Only an unused pending corridor can be permanently deleted.",
      409, { ...details, status: corridor.status }
    );
  }
  if (corridor.sourceReferenceId) {
    throw corridorError(
      "CORRIDOR_HAS_SOURCE_HISTORY",
      "This corridor was created from an external workflow and must be preserved for audit history.",
      409, { ...details, source: corridor.source, sourceReferenceId: corridor.sourceReferenceId }
    );
  }
  if (details.fleetCount > 0 || details.operationalVariantCount > 0) {
    throw corridorError(
      "CORRIDOR_IN_USE",
      "This corridor has operational references and cannot be permanently deleted.",
      409, details
    );
  }
  if (details.draftVariantCount > 0) {
    throw corridorError(
      "CORRIDOR_HAS_DRAFT_VARIANTS",
      "Delete this corridor's unused route drafts before deleting the corridor.",
      409, details
    );
  }
  return details;
}

module.exports = { assertCorridorCanDelete, getCorridorReferenceCounts };
