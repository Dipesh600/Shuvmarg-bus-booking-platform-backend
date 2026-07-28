"use strict";

const createTripStatusService = ({
  Trip,
  transitionPolicy,
  cancellationService,
  referralService,
  clock = () => new Date(),
}) => {
  const updateStatus = async ({
    fleetId,
    tripId,
    status,
    cancellationReason,
    adminId,
  }) => {
    const trip = await Trip.findOne({ _id: tripId, busId: fleetId });
    if (!trip) return { statusCode: 404, message: "Trip not found." };
    if (!transitionPolicy.canTransition(trip.status, status)) {
      return {
        statusCode: 400,
        message: `Invalid transition from ${trip.status} to ${status}`,
      };
    }
    if (status === "in-transit") {
      trip.actualDepartureTime = clock();
    } else if (status === "completed") {
      trip.actualArrivalTime = clock();
    } else if (status === "cancelled") {
      trip.cancelledBy = adminId;
      trip.cancellationReason =
        cancellationReason || "Cancelled by admin via Workstation";
      await cancellationService.cancelBookings(trip._id);
    }
    trip.status = status;
    await trip.save();
    if (status === "completed") {
      await referralService.processCompletion(trip._id);
    }
    return { trip };
  };
  return { updateStatus };
};

module.exports = { createTripStatusService };
