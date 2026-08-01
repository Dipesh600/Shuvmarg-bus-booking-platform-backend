"use strict";

const mongoose = require("mongoose");
const { boardingLocationError } = require(
  "../../../domain/boarding-location/boarding-location-errors.js"
);
const {
  idOf, resolveBoardingScope,
} = require("./passenger-boarding-options-scope.js");

function servedStops(trip) {
  const config = trip.scheduleId?.operatorRouteConfigId;
  const isReturn = trip.variantId?.direction === "RETURN";
  const stopIds = isReturn ? config?.returnActiveStops : config?.activeStops;
  return new Set((stopIds || []).map(idOf));
}

function createPassengerBoardingOptionsService(repository) {
  return async function resolvePassengerBoardingOptions({
    tripId, originStopId, destinationStopId,
    originSelectionStopId, destinationSelectionStopId,
  }) {
    const selectedOrigin = originSelectionStopId || originStopId;
    const selectedDestination = destinationSelectionStopId || destinationStopId;
    for (const id of [
      tripId, originStopId, destinationStopId, selectedOrigin, selectedDestination,
    ]) {
      if (!mongoose.isValidObjectId(id)) {
        throw boardingLocationError("INVALID_BOARDING_SELECTION", "Boarding selection is invalid.", 400);
      }
    }
    const trip = await repository.findTripBoardingContext(tripId);
    if (!trip?.brandId) {
      throw boardingLocationError("TRIP_BOARDING_UNAVAILABLE", "Trip boarding configuration is unavailable.", 409);
    }
    if (trip.scheduleId?.operatorRouteConfigId?.status !== "ACTIVE") {
      throw boardingLocationError(
        "TRIP_BOARDING_UNAVAILABLE", "Trip boarding configuration is unavailable.", 409
      );
    }
    const served = servedStops(trip);
    if (!served.has(originStopId) || !served.has(destinationStopId)) {
      throw boardingLocationError("STOP_NOT_SERVED", "The trip does not serve the selected stop pair.", 409);
    }
    const [pickup, drop] = await Promise.all([
      resolveBoardingScope({
        repository, trip, brandId: trip.brandId, selectedStopId: selectedOrigin,
        resolvedStopId: originStopId, served, usage: "PICKUP",
      }),
      resolveBoardingScope({
        repository, trip, brandId: trip.brandId, selectedStopId: selectedDestination,
        resolvedStopId: destinationStopId, served, usage: "DROP",
      }),
    ]);
    return {
      originStopId, destinationStopId,
      originSelectionStopId: selectedOrigin,
      destinationSelectionStopId: selectedDestination,
      pickupIsParentSelection: pickup.isParentSelection,
      dropIsParentSelection: drop.isParentSelection,
      pickupGroups: pickup.groups,
      dropGroups: drop.groups,
      pickupOptions: pickup.options,
      dropOptions: drop.options,
    };
  };
}

module.exports = { createPassengerBoardingOptionsService };
