"use strict";

const mongoose = require("mongoose");
const BoardingLocation = require("../../../../models/boardingLocationModel.js");
const Assignment = require("../../../../models/operatorBoardingAssignmentModel.js");
const { boardingLocationError } = require(
  "../../../domain/boarding-location/boarding-location-errors.js"
);
const { resolveOperationalStop } = require(
  "../../admin/platform-registry/boarding-location/boarding-location-stop.policy.js"
);
const { findNearbyBoardingLocations } = require(
  "../../admin/platform-registry/boarding-location/boarding-location-nearby.service.js"
);
const { mapBoardingLocation } = require(
  "../../admin/platform-registry/boarding-location/boarding-location.mapper.js"
);
const {
  assertOwnedActiveBrand, assertBrandServesStop,
} = require("./brand-ownership.policy.js");
const { mapBoardingAssignment } = require("./boarding-assignment.mapper.js");
const { editableFields } = require("./boarding-assignment.service.js");

async function requestBoardingLocation(ownerId, data) {
  const [brand, stop] = await Promise.all([
    assertOwnedActiveBrand(ownerId, data.brandId), resolveOperationalStop(data),
  ]);
  await assertBrandServesStop(brand._id, stop._id);
  const nearby = await findNearbyBoardingLocations({
    stopId: stop._id, coordinates: data.coordinates,
  });
  const session = await mongoose.startSession();
  let locationId;
  let assignmentId;
  try {
    await session.withTransaction(async () => {
      const [location] = await BoardingLocation.create([{
        stopId: stop._id, name: data.name, aliases: data.aliases || [],
        landmark: data.landmark, address: data.address,
        coordinates: data.coordinates, verificationStatus: "PENDING",
        source: "OPERATOR_REQUEST", status: "ACTIVE", createdBy: ownerId,
        createdByType: "BUS_OWNER",
      }], { session });
      const assignmentPayload = {
        brandId: brand._id, boardingLocationId: location._id,
        status: "PENDING_REVIEW", createdBy: ownerId,
      };
      for (const key of editableFields) {
        if (data[key] !== undefined) assignmentPayload[key] = data[key];
      }
      const [assignment] = await Assignment.create([assignmentPayload], { session });
      locationId = location._id;
      assignmentId = assignment._id;
    });
  } catch (error) {
    if (error?.code === 11000) {
      throw boardingLocationError(
        "BOARDING_LOCATION_IDENTITY_CONFLICT",
        "This location already exists. Select the canonical location instead.", 409
      );
    }
    throw error;
  } finally {
    await session.endSession();
  }
  const [location, assignment] = await Promise.all([
    BoardingLocation.findById(locationId).populate("stopId", "name code").lean(),
    Assignment.findById(assignmentId).populate("boardingLocationId").lean(),
  ]);
  return {
    location: mapBoardingLocation(location),
    assignment: mapBoardingAssignment(assignment),
    nearbyWarnings: nearby.map(mapBoardingLocation),
  };
}

module.exports = { requestBoardingLocation };
