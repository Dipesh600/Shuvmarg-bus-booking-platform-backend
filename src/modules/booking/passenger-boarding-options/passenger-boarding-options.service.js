"use strict";

const mongoose = require("mongoose");
const { resolveBoardingOptions } = require(
  "../../../domain/boarding-location/boarding-option-resolver.js"
);
const { boardingLocationError } = require(
  "../../../domain/boarding-location/boarding-location-errors.js"
);

const idOf = (value) => String(value?._id || value || "");

function findTiming(trip, stopId) {
  const config = trip.scheduleId?.operatorRouteConfigId;
  const isReturn = trip.variantId?.direction === "RETURN";
  const timings = isReturn ? config?.returnTimingConfig : config?.timingConfig;
  return (timings || []).find((entry) => idOf(entry.stopId) === stopId) || null;
}

function servedStops(trip) {
  const config = trip.scheduleId?.operatorRouteConfigId;
  const isReturn = trip.variantId?.direction === "RETURN";
  const stopIds = isReturn ? config?.returnActiveStops : config?.activeStops;
  return new Set((stopIds || []).map(idOf));
}

function assertUsageAllowed(timing, usage) {
  const behavior = timing?.stopBehavior || "BOTH";
  const allowed = usage === "PICKUP"
    ? ["BOARDING_ONLY", "BOTH"].includes(behavior)
    : ["DROPPING_ONLY", "BOTH"].includes(behavior);
  if (!allowed) {
    throw boardingLocationError(
      "BOARDING_USAGE_NOT_ALLOWED",
      `${usage === "PICKUP" ? "Pickup" : "Drop"} is not available at this stop.`,
      409
    );
  }
}

function attachTime(options, timing, usage, stop) {
  const time = usage === "PICKUP"
    ? timing?.estimatedDeparture || timing?.estimatedArrival
    : timing?.estimatedArrival || timing?.estimatedDeparture;
  return options.map((option) => ({
    ...option, stopName: stop.name, time: time || null,
  }));
}

function createPassengerBoardingOptionsService(repository) {
  return async function resolvePassengerBoardingOptions({
    tripId, originStopId, destinationStopId,
  }) {
    for (const id of [tripId, originStopId, destinationStopId]) {
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
    const [stops, assignments] = await Promise.all([
      repository.findStops([originStopId, destinationStopId]),
      repository.findOperatorAssignments(trip.brandId, [originStopId, destinationStopId]),
    ]);
    const stopById = new Map(stops.map((stop) => [idOf(stop), stop]));
    if (!stopById.has(originStopId) || !stopById.has(destinationStopId)) {
      throw boardingLocationError(
        "STOP_NOT_FOUND", "A selected route stop is no longer available.", 404
      );
    }
    const optionsFor = (stopId) => assignments.filter((assignment) =>
      idOf(assignment.boardingLocationId?.stopId) === stopId
    );
    const pickupTiming = findTiming(trip, originStopId);
    const dropTiming = findTiming(trip, destinationStopId);
    assertUsageAllowed(pickupTiming, "PICKUP");
    assertUsageAllowed(dropTiming, "DROP");
    const pickupOptions = resolveBoardingOptions({
      stop: stopById.get(originStopId), usage: "PICKUP",
      operatorOptions: optionsFor(originStopId),
    });
    const dropOptions = resolveBoardingOptions({
      stop: stopById.get(destinationStopId), usage: "DROP",
      operatorOptions: optionsFor(destinationStopId),
    });
    return {
      originStopId, destinationStopId,
      pickupOptions: attachTime(
        pickupOptions, pickupTiming, "PICKUP", stopById.get(originStopId)
      ),
      dropOptions: attachTime(
        dropOptions, dropTiming, "DROP", stopById.get(destinationStopId)
      ),
    };
  };
}

module.exports = { createPassengerBoardingOptionsService };
