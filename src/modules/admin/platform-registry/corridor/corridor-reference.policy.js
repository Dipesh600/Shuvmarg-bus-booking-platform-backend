"use strict";

const Bus = require("../../../../../models/fleetModel.js");
const RouteVariant = require("../../../../../models/routeVariantModel.js");
const {
  corridorError,
} = require("../../../../domain/corridor/corridor-errors.js");

async function getCorridorReferenceCounts(corridorId) {
  const [fleetCount, variantCount] = await Promise.all([
    Bus.countDocuments({ corridorId }),
    RouteVariant.countDocuments({ corridorId }),
  ]);
  return { fleetCount, variantCount };
}

async function assertCorridorCanDelete(corridor) {
  if (corridor.status !== "PENDING") {
    throw corridorError(
      "CORRIDOR_DELETE_REQUIRES_PENDING",
      "Only an unused pending corridor can be permanently deleted.", 409
    );
  }
  const details = await getCorridorReferenceCounts(corridor._id);
  if (details.fleetCount > 0 || details.variantCount > 0) {
    throw corridorError(
      "CORRIDOR_IN_USE",
      "This corridor is referenced and cannot be permanently deleted.",
      409, details
    );
  }
}

module.exports = { assertCorridorCanDelete, getCorridorReferenceCounts };
