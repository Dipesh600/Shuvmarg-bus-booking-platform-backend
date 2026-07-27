"use strict";

const RouteDiscovery = require("../../../../models/routeDiscoveryModel.js");
const { assertTransition } = require("./route-discovery-state.policy.js");
const { buildFrontendGeometry } = require("./polyline.js");
const {
  acquireStopsForSelectedRoute,
} = require("./route-stop-acquisition.service.js");

const selectRouteOption = async (
  sessionId,
  routeOptionIndex,
  adminId,
  routeMetadata = {}
) => {
  const session = await RouteDiscovery.findById(sessionId)
    .populate("originStopId", "name coordinates")
    .populate("destinationStopId", "name coordinates");
  if (!session) throw new Error("Discovery session not found.");
  assertTransition(session.status, "ROUTE_SELECTED");
  const frontendGeometry = buildFrontendGeometry(routeMetadata);
  if (session.routeOptions.length === 0 && routeMetadata.summary) {
    session.routeOptions = [
      {
        provider: routeMetadata.provider || "GOOGLE",
        providerRouteId: `google-frontend-${Date.now()}`,
        summary: routeMetadata.summary,
        distanceKm: routeMetadata.distanceKm,
        durationMins: routeMetadata.durationMins,
        geometry: frontendGeometry,
      },
    ];
    routeOptionIndex = 0;
  }
  if (session.routeOptions.length === 0) {
    throw new Error("No route options available. Select a route on the map first.");
  }
  if (
    routeOptionIndex < 0 ||
    routeOptionIndex >= session.routeOptions.length
  ) {
    throw new Error(
      `Invalid routeOptionIndex: ${routeOptionIndex}. ` +
      `Must be between 0 and ${session.routeOptions.length - 1}.`
    );
  }
  session.selectedRouteOptionIndex = routeOptionIndex;
  session.status = "ROUTE_SELECTED";
  await session.save();
  setImmediate(() => acquireStopsForSelectedRoute(session, routeOptionIndex));
  return session;
};

const setRouteOptions = async (sessionId, routeOptions) => {
  if (!Array.isArray(routeOptions) || routeOptions.length === 0) {
    throw new Error("routeOptions must be a non-empty array.");
  }
  const session = await RouteDiscovery.findById(sessionId);
  if (!session) throw new Error("Discovery session not found.");
  if (!["DRAFT", "ROUTE_SELECTED"].includes(session.status)) {
    throw new Error(`Cannot update route options in status "${session.status}".`);
  }
  session.routeOptions = routeOptions;
  session.selectedRouteOptionIndex = null;
  session.status = "DRAFT";
  await session.save();
  return session;
};

module.exports = { selectRouteOption, setRouteOptions };
