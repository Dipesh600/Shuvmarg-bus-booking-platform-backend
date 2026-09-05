"use strict";
const { assertDriverEligible } = require("./driver-eligibility.policy");

// Future inventory can still be generated when the default driver is no longer
// eligible. It remains unassigned and cannot board/depart until a replacement
// passes the same eligibility gate.
async function resolveDefaultDriver({ driverId, brandId, tripDate }, { DriverProfile, logger }) {
  if (!driverId) return null;
  const driver = await DriverProfile.findById(driverId).lean();
  try {
    assertDriverEligible(driver, { brandId, at: tripDate });
    return driver._id;
  } catch (error) {
    if (!error.isOperational) throw error;
    logger.warn("Generated trip requires an eligible replacement driver", { driverId, brandId, tripDate });
    return null;
  }
}
module.exports = { resolveDefaultDriver };
