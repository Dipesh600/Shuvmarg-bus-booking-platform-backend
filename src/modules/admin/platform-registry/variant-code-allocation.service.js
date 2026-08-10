"use strict";

const RouteCorridor = require("../../../../models/routeCorridorModel.js");
const RouteVariant = require("../../../../models/routeVariantModel.js");
const { routeVariantError } = require("./route-variant-errors.js");

const MAX_ALLOCATION_ATTEMPTS = 10000;

function suffixForDirection(direction) {
  if (direction === "FORWARD") return "F";
  if (direction === "RETURN") return "R";
  throw routeVariantError(
    "INVALID_VARIANT_DIRECTION",
    "Variant direction must be FORWARD or RETURN."
  );
}

/**
 * Allocate a human-readable code atomically. Never derive a new code from a
 * document count: concurrent admins can otherwise receive the same code.
 */
function buildVariantCode(corridorCode, sequence, direction) {
  return `${corridorCode}-V${String(sequence).padStart(2, "0")}-${suffixForDirection(direction)}`;
}

/**
 * The corridor counter is the concurrency boundary. The additional existence
 * check makes a rollout safe for older corridors whose counter was never
 * backfilled: any already-used legacy code is skipped, then the next atomic
 * counter value is tried. The RouteVariant unique index remains the final
 * database guard.
 */
async function allocateVariantCode(
  corridorId, direction,
  { RouteCorridorModel = RouteCorridor, RouteVariantModel = RouteVariant } = {}
) {
  const suffix = suffixForDirection(direction);
  for (let attempt = 0; attempt < MAX_ALLOCATION_ATTEMPTS; attempt += 1) {
    const corridor = await RouteCorridorModel.findOneAndUpdate(
      { _id: corridorId },
      [{
        $set: {
          variantSequence: {
            $add: [{ $ifNull: ["$variantSequence", 0] }, 1],
          },
        },
      }],
      { new: true }
    ).select("code variantSequence").lean();

    if (!corridor) {
      throw routeVariantError("CORRIDOR_NOT_FOUND", "Corridor not found.", 404);
    }

    const code = `${corridor.code}-V${String(corridor.variantSequence).padStart(2, "0")}-${suffix}`;
    const existing = await RouteVariantModel.exists({ code });
    if (!existing) return code;
  }

  throw routeVariantError(
    "VARIANT_CODE_ALLOCATION_EXHAUSTED",
    "Unable to allocate a unique route variant code. Run the variant-code preflight before retrying.",
    409,
    { corridorId: String(corridorId), direction }
  );
}

module.exports = {
  MAX_ALLOCATION_ATTEMPTS,
  allocateVariantCode,
  buildVariantCode,
  suffixForDirection,
};
