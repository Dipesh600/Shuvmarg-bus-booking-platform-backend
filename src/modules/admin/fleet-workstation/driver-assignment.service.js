"use strict";

const createDriverAssignmentService = ({
  Trip,
  DriverProfile,
  clock = () => new Date(),
}) => {
  const reassign = async ({ fleetId, tripId, driverId, reason, adminId }) => {
    const trip = await Trip.findOne({ _id: tripId, busId: fleetId });
    if (!trip) return { statusCode: 404, message: "Trip not found." };
    const driver = await DriverProfile.findOne({
      _id: driverId,
      brandId: trip.brandId,
    });
    if (!driver) {
      return {
        statusCode: 400,
        message: "Driver not found or doesn't belong to this brand.",
      };
    }
    trip.driverAssignmentLog.push({
      driverId: driver._id,
      assignedAt: clock(),
      assignedBy: adminId,
      reason: reason || "Manual reassignment via Workstation",
    });
    trip.driverId = driver._id;
    await trip.save();
    return { trip };
  };
  return { reassign };
};

module.exports = { createDriverAssignmentService };
