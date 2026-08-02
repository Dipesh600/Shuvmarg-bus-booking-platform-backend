"use strict";

const { buildStopIdentity } = require("../stop-identity");
const { scanError } = require("./migration-errors");

function scanStopIdentityConflicts(stop, identityMap) {
  let identity = null;
  let error = null;

  try {
    identity = buildStopIdentity({
      name: stop.name,
      district: stop.district,
      municipality: stop.municipality,
      parentStopId: stop.parentStopId,
    });
  } catch (err) {
    error = scanError(stop, "INVALID_STOP_NAME", err.message);
    return { identity: null, error };
  }

  if (identity) {
    if (identityMap.has(identity)) {
      error = scanError(
        stop,
        "STOP_IDENTITY_CONFLICT",
        `Stops share the same identity: "${identity}"`
      );
      return { identity, error };
    }
    identityMap.set(identity, stop._id);
  }

  return { identity, error: null };
}

module.exports = { scanStopIdentityConflicts };
