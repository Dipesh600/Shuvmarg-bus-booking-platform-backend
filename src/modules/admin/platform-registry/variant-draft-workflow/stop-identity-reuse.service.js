"use strict";

const Stop = require("../../../../../models/stopModel.js");
const { buildStopIdentity } = require("../stop-identity.js");
const { routeVariantError } = require("../route-variant-errors.js");
const { STOP_REFERENCE_FIELDS } = require("./context.service.js");

async function findReusableStopByIdentity(proposedStop, options = {}) {
  const identity = buildStopIdentity(proposedStop);
  let query = Stop.findOne({ _normalizedIdentity: identity }).select(STOP_REFERENCE_FIELDS);
  if (options.session && typeof query.session === "function") query = query.session(options.session);
  const existing = await query;
  if (!existing) return null;
  if (existing.status !== "ACTIVE" || existing.verificationStatus !== "VERIFIED" || !existing.isRouteStop) {
    throw routeVariantError(
      "STOP_IDENTITY_OCCUPIED",
      `The proposed Stop matches existing Stop ${existing.code || existing.name}, but that record is not an active verified route stop. Resolve it in the Stop Registry before saving this path.`,
      409,
      { existingStopId: String(existing._id), existingStopCode: existing.code, identity }
    );
  }
  return existing;
}

module.exports = { findReusableStopByIdentity };
