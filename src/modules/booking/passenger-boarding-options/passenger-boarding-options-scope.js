"use strict";

const { resolveBoardingOptions } = require(
  "../../../domain/boarding-location/boarding-option-resolver.js"
);
const { boardingLocationError } = require(
  "../../../domain/boarding-location/boarding-location-errors.js"
);

const idOf = (value) => String(value?._id || value || "");

function timingConfig(trip) {
  const config = trip.scheduleId?.operatorRouteConfigId;
  return trip.variantId?.direction === "RETURN"
    ? config?.returnTimingConfig
    : config?.timingConfig;
}

function findTiming(trip, stopId) {
  return (timingConfig(trip) || []).find(
    (entry) => idOf(entry.stopId) === stopId
  ) || null;
}

function hasUsageTime(timing, usage) {
  if (!timing) return false;
  return usage === "PICKUP"
    ? Boolean(timing.estimatedDeparture || timing.estimatedArrival)
    : Boolean(timing.estimatedArrival || timing.estimatedDeparture);
}

function usageAllowed(timing, usage) {
  const behavior = timing?.stopBehavior || "BOTH";
  return usage === "PICKUP"
    ? ["BOARDING_ONLY", "BOTH"].includes(behavior)
    : ["DROPPING_ONLY", "BOTH"].includes(behavior);
}

function attachContext(options, timing, usage, stop, isChildOfSelection) {
  const time = usage === "PICKUP"
    ? timing?.estimatedDeparture || timing?.estimatedArrival
    : timing?.estimatedArrival || timing?.estimatedDeparture;
  return options.map((option) => ({
    ...option,
    stopName: stop.name,
    parentStopId: stop.parentStopId ? idOf(stop.parentStopId) : null,
    municipality: stop.municipality || null,
    district: stop.district || null,
    province: stop.province || null,
    time: time || null,
    isChildOfSelection,
  }));
}

function assertSelectionStop(stop) {
  if (!stop || stop.status !== "ACTIVE" ||
      stop.verificationStatus !== "VERIFIED" || stop.isSearchable === false) {
    throw boardingLocationError(
      "STOP_NOT_FOUND", "The selected stop is no longer available.", 404
    );
  }
}

async function resolveBoardingScope({
  repository, trip, brandId, selectedStopId, resolvedStopId, served, usage,
}) {
  const [selectedStop] = await repository.findStops([selectedStopId]);
  assertSelectionStop(selectedStop);
  const children = await repository.findChildStops(selectedStopId);
  const servedChildren = children.filter((child) => served.has(idOf(child)));
  const parentIsServed = served.has(selectedStopId);
  const isParentSelection = children.length > 0;
  const candidateStops = servedChildren.length > 0
    ? servedChildren
    : parentIsServed ? [selectedStop] : [];
  const selectionContainsResolvedStop = isParentSelection
    ? selectedStopId === resolvedStopId ||
      servedChildren.some((child) => idOf(child) === resolvedStopId)
    : selectedStopId === resolvedStopId;
  if (!selectionContainsResolvedStop) {
    throw boardingLocationError(
      "INVALID_BOARDING_SELECTION",
      "The selected stop does not match this trip segment.",
      400
    );
  }
  const candidateIds = isParentSelection
    ? candidateStops.map(idOf)
    : [resolvedStopId];
  const stops = await repository.findStops(candidateIds);
  const candidateSet = new Set(candidateIds);
  const timingFor = (stopId) => findTiming(trip, stopId);
  const validStops = stops.filter((stop) => {
    const stopId = idOf(stop);
    const timing = timingFor(stopId);
    return candidateSet.has(stopId) && served.has(stopId) &&
      stop.status === "ACTIVE" && stop.verificationStatus === "VERIFIED" &&
      stop.isRouteStop === true && hasUsageTime(timing, usage) &&
      usageAllowed(timing, usage);
  });
  if (validStops.length === 0) {
    throw boardingLocationError(
      "BOARDING_USAGE_NOT_ALLOWED",
      `${usage === "PICKUP" ? "Pickup" : "Drop"} is not available for the selected stop.`,
      409
    );
  }
  const assignments = await repository.findOperatorAssignments(
    brandId, validStops.map(idOf)
  );
  const groups = validStops.map((stop) => {
    const stopId = idOf(stop);
    const stopAssignments = assignments.filter((assignment) =>
      idOf(assignment.boardingLocationId?.stopId) === stopId
    );
    const options = attachContext(resolveBoardingOptions({
      stop, usage, operatorOptions: stopAssignments,
    }), timingFor(stopId), usage, stop, isParentSelection);
    return {
      stopId,
      stopName: stop.name,
      municipality: stop.municipality || null,
      district: stop.district || null,
      province: stop.province || null,
      isChildOfSelection: isParentSelection,
      options,
    };
  });
  return {
    isParentSelection,
    groups,
    options: groups.flatMap((group) => group.options),
  };
}

module.exports = { idOf, resolveBoardingScope };
