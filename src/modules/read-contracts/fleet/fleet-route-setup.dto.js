"use strict";

function mapRouteSetup(routeSetup) {
  if (!routeSetup) return null;

  const origin = routeSetup.originStopId?.name || routeSetup.customOrigin?.name || null;
  const destination = routeSetup.destinationStopId?.name || routeSetup.customDestination?.name || null;

  return {
    routeSetupId: routeSetup._id ? String(routeSetup._id) : null,
    origin,
    destination,
    originStop: routeSetup.originStopId ? { id: String(routeSetup.originStopId._id || routeSetup.originStopId), name: origin } : null,
    destinationStop: routeSetup.destinationStopId ? { id: String(routeSetup.destinationStopId._id || routeSetup.destinationStopId), name: destination } : null,
    corridorId: routeSetup.corridorId ? String(routeSetup.corridorId._id || routeSetup.corridorId) : null,
    corridorCode: routeSetup.corridorId?.code || null,
    direction: routeSetup.direction || routeSetup.variantId?.direction || null,
    servedStops: (routeSetup.servedStops || []).map((stop, index) => ({
      stopId: stop.stopId ? String(stop.stopId._id || stop.stopId) : null,
      name: stop.stopId?.name || stop.stopId?.city || `Stop ${index + 1}`,
      sequence: stop.sequence,
      usage: stop.usage,
      boardingMode: stop.boardingMode || "STOP_FALLBACK",
      boardingLocationIds: (stop.boardingLocationIds || []).map(String),
      customBoardingPoints: stop.customBoardingPoints || [],
      meetingDetails: stop.meetingDetails || {},
    })),
    addedPlaces: (routeSetup.unresolvedPlaces || []).map((place) => ({
      clientKey: place.clientKey,
      name: place.name,
      address: place.address || "",
      usage: place.usage,
      existingStopId: place.existingStopId ? String(place.existingStopId) : null,
      insertAfterStopId: place.insertAfterStopId ? String(place.insertAfterStopId) : "",
      coordinates: place.coordinates || null,
      customBoardingPoints: place.customBoardingPoints || [],
      meetingDetails: place.meetingDetails || {},
    })),
    returnEnabled: routeSetup.returnEnabled ?? true,
    resolutionStatus: routeSetup.resolutionStatus || "AVAILABLE",
    selectedVariant: routeSetup.variantId
      ? {
          variantId: String(routeSetup.variantId._id || routeSetup.variantId),
          code: routeSetup.variantId.code || null,
          name: routeSetup.variantId.name || null,
          type: routeSetup.variantId.type || null,
          direction: routeSetup.variantId.direction || routeSetup.direction || null,
          distanceKm: routeSetup.variantId.distanceKm ?? null,
          durationMinutes: routeSetup.variantId.durationMinutes ?? null,
        }
      : null,
  };
}

module.exports = { mapRouteSetup };
