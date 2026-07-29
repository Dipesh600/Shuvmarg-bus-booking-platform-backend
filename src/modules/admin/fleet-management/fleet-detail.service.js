"use strict";

function createFleetDetailService({ mongoose, repository }) {
  return async function getFleetDetail(id) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return {
        statusCode: 400,
        body: { success: false, message: "Invalid fleet ID format" },
      };
    }

    const fleet = await repository.findById(id);
    if (!fleet) {
      return {
        statusCode: 404,
        body: { success: false, message: "Fleet not found" },
      };
    }

    const recentTrips = await repository.findRecentTrips(id);
    return {
      statusCode: 200,
      body: {
        success: true,
        message: "Fleet details fetched successfully",
        data: { ...fleet.toObject(), recentTrips },
      },
    };
  };
}

module.exports = { createFleetDetailService };
