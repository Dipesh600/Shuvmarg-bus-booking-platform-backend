"use strict";
const AppError = require("../../../shared/errors/app-error");
const { assertId } = require("./crew-input.policy");
const { normalizeTripStatus } = require("../../../shared/crew/trip-status.policy");

function createConductorTripController({ Trip, ConductorProfile, logger }) {
  const change = assign => async (req, res) => {
    try {
      const ownerId = req.userInfo?.id;
      const { profileId, tripId } = req.params;
      assertId(ownerId, "Owner"); assertId(profileId, "Conductor"); assertId(tripId, "Trip");
      const filter = { _id: profileId, ownerId, removedAt: null, accessStatus: "ACTIVE",
        status: { $in: ["AVAILABLE", "ON_DUTY", "OFF_DUTY"] } };
      const profile = await ConductorProfile.findOne(filter).lean();
      if (!profile) throw new AppError("Active conductor not found.", 404);
      const trip = await Trip.findOne({ _id: tripId, ownerId, brandId: profile.brandId }).lean();
      if (!trip) throw new AppError("Trip not found in this conductor's brand.", 404);
      if (assign && !["scheduled", "boarding", "in-transit"].includes(normalizeTripStatus(trip.status))) {
        throw new AppError("Cannot assign a conductor to a terminal trip.", 400);
      }
      const profileUpdate = await ConductorProfile.findOneAndUpdate(
        { ...filter, brandId: profile.brandId },
        assign ? { $addToSet: { assignedTripIds: tripId }, $inc: { __v: 1 } } : { $pull: { assignedTripIds: tripId }, $inc: { __v: 1 } },
        { new: true, runValidators: true });
      if (!profileUpdate) throw new AppError("Crew access changed. Refresh and retry.", 409);
      return res.status(200).json({ success: true, message: assign ? "Conductor assigned to trip." : "Conductor removed from trip.",
        data: { profileId, tripId, assigned: assign } });
    } catch (error) {
      if (!error.isOperational) logger.error("Conductor trip assignment failed", { error: error.message });
      return res.status(error.isOperational ? error.statusCode : 500).json({ success: false,
        message: error.isOperational ? error.message : "Unable to update trip assignment." });
    }
  };
  return { assignConductorTrip: change(true), removeConductorTrip: change(false) };
}
module.exports = { createConductorTripController };
