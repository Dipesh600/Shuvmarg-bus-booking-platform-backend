"use strict";

const Stop = require("../../../../models/stopModel.js");
const { fleetRouteError } = require("./fleet-route-errors.js");
const { validateCustomBoardingPoints } = require("./route-setup.validation.js");

async function validateUnresolvedPlaces(data, allowedStopIds) {
  const places = Array.isArray(data.unresolvedPlaces) ? data.unresolvedPlaces : [];
  const keys = new Set();
  const existingIds = new Set();
  const fallbackAnchors = new Set([String(data.originStopId || ""), String(data.destinationStopId || "")]);
  for (const place of places) {
    if (!place.clientKey || keys.has(place.clientKey) || !place.name?.trim()) {
      throw fleetRouteError("INVALID_ADDED_ROUTE_PLACE", "Added route places must be unique and named.");
    }
    keys.add(place.clientKey);
    if (place.insertAfterStopId) {
      const anchorAllowed = allowedStopIds
        ? allowedStopIds.has(String(place.insertAfterStopId))
        : fallbackAnchors.has(String(place.insertAfterStopId));
      if (!anchorAllowed && allowedStopIds) {
        throw fleetRouteError("INVALID_ADDED_ROUTE_PLACE_ORDER", "Place added stops on the selected journey.");
      }
    }
    if (place.existingStopId) {
      if (existingIds.has(String(place.existingStopId))) {
        throw fleetRouteError("DUPLICATE_ADDED_ROUTE_PLACE", "This route place was already added.");
      }
      existingIds.add(String(place.existingStopId));
      const stop = await Stop.findOne({
        _id: place.existingStopId, status: "ACTIVE", verificationStatus: "VERIFIED", isRouteStop: true,
      }).select("_id").lean();
      if (!stop) throw fleetRouteError("ADDED_ROUTE_PLACE_UNAVAILABLE", "An added route place is unavailable.", 409);
    } else if (place.coordinates?.lat == null || place.coordinates?.lng == null) {
      throw fleetRouteError("ADDED_ROUTE_PLACE_POSITION_REQUIRED", "Place added route locations on the map.");
    }
    if (place.customBoardingPoints) validateCustomBoardingPoints(place.customBoardingPoints);
  }
}

module.exports = { validateUnresolvedPlaces };
