"use strict";

const {
  boardingLocationError,
} = require("../../../../domain/boarding-location/boarding-location-errors.js");
const { mapBoardingLocation } = require("./boarding-location.mapper.js");

function mapBoardingLocationWriteError(error) {
  if (error?.code !== 11000) throw error;
  throw boardingLocationError(
    "BOARDING_LOCATION_IDENTITY_CONFLICT",
    "A boarding location with this name already exists under the route stop.",
    409
  );
}

function assertNearbyReview(nearby, review) {
  if (nearby.length === 0) return;
  if (review?.acknowledged === true && review.reason?.trim()) return;
  throw boardingLocationError(
    "BOARDING_LOCATION_NEARBY_REVIEW_REQUIRED",
    "Review the nearby boarding places before creating another one.",
    409,
    { nearbyLocations: nearby.map(mapBoardingLocation) }
  );
}

function buildVerificationFields(data, adminId) {
  if (data.verificationStatus !== "VERIFIED") {
    return {
      verificationStatus: data.verificationStatus || "PENDING",
      verificationMethod: null, verifiedBy: null, verifiedAt: null,
      verificationNotes: data.verificationNotes || null,
    };
  }
  return {
    verificationStatus: "VERIFIED",
    verificationMethod: data.verificationMethod || "DESK_MAP",
    verifiedBy: adminId || null,
    verifiedAt: new Date(),
    verificationNotes: data.verificationNotes || null,
  };
}

module.exports = {
  assertNearbyReview, buildVerificationFields,
  mapBoardingLocationWriteError,
};
