"use strict";
const DriverProfile = require("../../../../models/driverProfileModel");
const { assertDriverEligible } = require("../../../shared/crew/driver-eligibility.policy");

async function assertScheduleDriverEligible(schedule, DriverModel = DriverProfile) {
  // Unassigned drafts remain supported; boarding always requires a driver.
  if (!schedule.driverId) return;
  const driver = await DriverModel.findById(schedule.driverId).lean();
  assertDriverEligible(driver, { brandId: schedule.brandId, at: schedule.effectiveFrom });
}
module.exports = { assertScheduleDriverEligible };
