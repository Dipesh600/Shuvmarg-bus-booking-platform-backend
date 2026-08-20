"use strict";

function mapRouteSetup(routeSetup) {
  if (!routeSetup) return null;

  const origin = routeSetup.originStopId?.name || routeSetup.customOrigin?.name || null;
  const destination = routeSetup.destinationStopId?.name || routeSetup.customDestination?.name || null;

  return {
    routeSetupId: routeSetup._id ? String(routeSetup._id) : null,
    origin,
    destination,
    servedStops: (routeSetup.servedStops || []).map((stop, index) => ({
      stopId: stop.stopId ? String(stop.stopId._id || stop.stopId) : null,
      name: stop.stopId?.name || stop.stopId?.city || `Stop ${index + 1}`,
      sequence: stop.sequence,
      usage: stop.usage,
      meetingDetails: stop.meetingDetails || {},
    })),
    addedPlaces: (routeSetup.unresolvedPlaces || []).map((place) => ({
      clientKey: place.clientKey,
      name: place.name,
      address: place.address || "",
      usage: place.usage,
    })),
    returnEnabled: routeSetup.returnEnabled ?? true,
    resolutionStatus: routeSetup.resolutionStatus || "AVAILABLE",
    selectedVariant: routeSetup.variantId
      ? { variantId: String(routeSetup.variantId._id || routeSetup.variantId) }
      : null,
  };
}

module.exports = { mapRouteSetup };
