"use strict";

const AppError = require("../errors/app-error");
const fail = (message) => { throw new AppError(message, 400, null, "DRIVER_NOT_ELIGIBLE"); };
const id = (value) => String(value?._id || value || "");

// Expiries are calendar dates. Certificates remain valid through their expiry
// day in Nepal, including trips later that day.
const day = (value) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Date(date.getTime() + 345 * 60_000).toISOString().slice(0, 10) : null;
};

function assertDriverCompliance(driver, { at = new Date(), requireDocuments = true } = {}) {
  if (!driver) fail("Driver profile not found.");
  const boundary = day(at);
  if (!boundary) fail("A valid trip date is required to check driver eligibility.");
  if (!driver.licenseNumber || !["HV", "LV", "TRK"].includes(driver.licenseType)) {
    fail("Driver license number and valid license type are required.");
  }
  if (!driver.licenseExpiry || !day(driver.licenseExpiry) || day(driver.licenseExpiry) < boundary) {
    fail("Driver license is missing, invalid or expired for this operation.");
  }
  if (requireDocuments && !(driver.licenseDoc || driver.documents?.license?.url)) {
    fail("Upload the driver license document before approval or assignment.");
  }
  const medicalDoc = driver.medicalCertDoc || driver.documents?.medical?.url;
  // Medical stays optional under the existing contract. Once supplied, both
  // evidence and validity are required; no new legal requirement is invented.
  if (medicalDoc || driver.medicalCertExpiry) {
    if (!driver.medicalCertExpiry || !day(driver.medicalCertExpiry) || day(driver.medicalCertExpiry) < boundary) {
      fail("Driver medical certificate is missing a valid expiry or has expired.");
    }
    if (requireDocuments && !medicalDoc) fail("Upload the driver medical certificate.");
  }
}

function assertDriverEligible(driver, { brandId, at, now = new Date() } = {}) {
  if (!driver) fail("Driver profile not found.");
  if (!id(brandId) || id(driver.brandId) !== id(brandId)) fail("Driver does not belong to this brand.");
  if (driver.removedAt) fail("Driver crew access has been removed.");
  if (driver.accessStatus !== "ACTIVE") {
    fail("Driver role access must be ACTIVE before assignment or operation.");
  }
  if (driver.approvalStatus !== "APPROVED") fail("Driver must be APPROVED before assignment or operation.");
  if (!["AVAILABLE", "ON_DUTY", "OFF_DUTY"].includes(driver.status)) {
    fail("Driver is SUSPENDED or INACTIVE and cannot be assigned or operate a trip.");
  }
  if (at && !day(at)) fail("A valid trip date is required to check driver eligibility.");
  const operationDate = at && new Date(at) > new Date(now) ? at : now;
  assertDriverCompliance(driver, { at: operationDate });
}

function assertAssignableTrip(trip) {
  if (!trip) throw new AppError("Trip not found.", 404);
  if (!["scheduled", "boarding", "in-transit", "in_transit"].includes(trip.status)) {
    fail("Cannot assign a driver to a completed, cancelled or invalid trip.");
  }
}

module.exports = { assertDriverCompliance, assertDriverEligible, assertAssignableTrip };
