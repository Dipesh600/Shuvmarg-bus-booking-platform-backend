"use strict";

const Assignment = require(
  "../../../../../models/operatorBoardingAssignmentModel.js"
);
const {
  boardingLocationError,
} = require("../../../../domain/boarding-location/boarding-location-errors.js");

async function assertNoActiveBoardingAssignments(boardingLocationId) {
  const assignmentCount = await Assignment.countDocuments({
    boardingLocationId,
    status: "ACTIVE",
  });
  if (assignmentCount > 0) {
    throw boardingLocationError(
      "BOARDING_LOCATION_IN_USE",
      "Active operator assignments must be disabled before this location.",
      409,
      { assignmentCount }
    );
  }
}

module.exports = { assertNoActiveBoardingAssignments };
