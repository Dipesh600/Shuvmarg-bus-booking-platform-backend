"use strict";

const {
  boardingLocationError,
} = require("../../../../domain/boarding-location/boarding-location-errors.js");
const { mapBoardingLocation } = require("./boarding-location.mapper.js");
const {
  normalizeBoardingAddress, normalizeBoardingProviderMetadata,
} = require("../../../../domain/boarding-location/boarding-location-address.js");

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

function buildBoardingLocationPayload(data, adminId, stopId) {
  return {
    stopId,
    name: data.name,
    aliases: data.aliases || [],
    landmark: data.landmark,
    address: normalizeBoardingAddress(data.address),
    locationType: data.locationType,
    gateOrBay: data.gateOrBay,
    directionHint: data.directionHint,
    coordinates: data.coordinates,
    coordinateSource: data.coordinateSource || "MAP_PIN",
    coordinateAccuracyMeters: data.coordinateAccuracyMeters,
    capturedAt: data.capturedAt,
    providerMetadata: normalizeBoardingProviderMetadata(data.providerMetadata),
    ...buildVerificationFields(data, adminId),
    nearbyReview: data.nearbyReview?.acknowledged ? {
      reason: data.nearbyReview.reason || "Reviewed nearby locations",
      reviewedBy: adminId || null,
      reviewedAt: new Date(),
    } : undefined,
    source: data.source || "ADMIN",
    status: data.status || "ACTIVE",
    createdBy: adminId || null,
    createdByType: "ADMIN",
  };
}

module.exports = {
  assertNearbyReview, buildVerificationFields, buildBoardingLocationPayload,
  mapBoardingLocationWriteError,
};
