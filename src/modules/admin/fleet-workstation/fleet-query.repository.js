"use strict";

const createFleetQueryRepository = ({ Bus, DriverProfile }) => ({
  findFleet(id) {
    return Bus.findById(id)
      .populate({
        path: "corridorId",
        select: "code originId destinationId",
        populate: [
          { path: "originId", select: "name code" },
          { path: "destinationId", select: "name code" },
        ],
      })
      .populate("brandId", "brandName commissionRate logo brandCode")
      .populate("ownerId", "name phone email")
      .populate("amenityIds", "name icon")
      .lean();
  },

  findAssignedDriver(fleetId) {
    return DriverProfile.findOne({
      assignedBusId: fleetId,
      approvalStatus: "APPROVED",
    })
      .select(
        "fullName phone licenseNumber licenseType status " +
          "documents.license.validTill documents.medical.validTill"
      )
      .lean();
  },
});

module.exports = { createFleetQueryRepository };
