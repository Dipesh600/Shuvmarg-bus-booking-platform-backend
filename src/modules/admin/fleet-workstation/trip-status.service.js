"use strict";
const { assertDriverEligible } = require("../../../shared/crew/driver-eligibility.policy");
const { normalizeTripStatus } = require("../../../shared/crew/trip-status.policy");

const createTripStatusService = ({
  Trip,
  DriverProfile,
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
    trip.$where = { status: trip.status, driverId: trip.driverId || null };
    status = normalizeTripStatus(status);
    if (!transitionPolicy.canTransition(trip.status, status)) {
      return {
        statusCode: 400,
        message: `Invalid transition from ${trip.status} to ${status}`,
      };
    }
    if (["boarding", "in-transit"].includes(status)) {
      const driver = trip.driverId ? await DriverProfile.findById(trip.driverId) : null;
      assertDriverEligible(driver, { brandId: trip.brandId, at: trip.tripDate, now: clock() });
    }
    if (status === "in-transit") {
      trip.actualDepartureTime = clock();
    } else if (status === "completed") {
      trip.actualArrivalTime = clock();
    } else if (status === "cancelled") {
      trip.cancelledBy = adminId;
      trip.cancellationReason =
        cancellationReason || "Cancelled by admin via Workstation";
      return cancellationService.cancelTrip({ tripId: trip._id, fleetId, adminId,
        reason: trip.cancellationReason });
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
