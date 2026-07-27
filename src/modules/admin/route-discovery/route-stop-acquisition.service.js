"use strict";

const axios = require("axios");
const RouteDiscovery = require("../../../../models/routeDiscoveryModel.js");
const { extractStopCoordinates } = require("../../../../services/mapboxClient.js");
const {
  discoverStopsAlongRoute,
} = require("../../../../services/googlePlacesClient.js");
const { decodePolyline } = require("./polyline.js");

const fetchDirectionsGeometry = async (origin, destination) => {
  const originCoords = extractStopCoordinates(origin);
  const destinationCoords = extractStopCoordinates(destination);
  if (!originCoords || !destinationCoords) return null;
  try {
    const { data } = await axios.get(
      "https://maps.googleapis.com/maps/api/directions/json",
      {
        params: {
          origin: `${origin.name || `${originCoords.lat},${originCoords.lng}`}, Nepal`,
          destination:
            `${destination.name || `${destinationCoords.lat},${destinationCoords.lng}`}, Nepal`,
          mode: "driving",
          region: "NP",
          key: process.env.GOOGLE_MAPS_API_KEY,
        },
        timeout: 10_000,
      }
    );
    if (data.routes?.length) {
      return {
        type: "LineString",
        coordinates: decodePolyline(data.routes[0].overview_polyline.points),
      };
    }
  } catch (error) {
    console.warn(
      `[Discovery] Directions fetch failed (${error.message}), falling back to straight line.`
    );
  }
  return {
    type: "LineString",
    coordinates: [
      [originCoords.lng, originCoords.lat],
      [destinationCoords.lng, destinationCoords.lat],
    ],
  };
};

const acquireStopsForSelectedRoute = async (session, routeOptionIndex) => {
  try {
    const selectedRoute = session.routeOptions[routeOptionIndex];
    const origin = session.originStopId;
    const destination = session.destinationStopId;
    const geometry =
      selectedRoute?.geometry ||
      (await fetchDirectionsGeometry(origin, destination));
    if (!geometry) {
      console.warn(
        `[Discovery] Session ${session._id}: no geometry and stops have no coordinates. Cannot auto-discover stops.`
      );
      return;
    }
    const discoveredStops = await discoverStopsAlongRoute(
      geometry,
      selectedRoute.distanceKm,
      selectedRoute.durationMins,
      origin?.name || "",
      destination?.name || ""
    );
    await RouteDiscovery.findByIdAndUpdate(session._id, {
      discoveredStops,
      status: "STOPS_DISCOVERED",
    });
    if (discoveredStops.length === 0) {
      console.warn(
        `[Discovery] Session ${session._id}: Google Places found no bus stops along route.`
      );
    } else {
      console.log(
        `[Discovery] Session ${session._id}: ${discoveredStops.length} stop(s) discovered via Google Places.`
      );
    }
  } catch (error) {
    console.error(
      `[Discovery] Session ${session._id}: Google Places fetch failed — ${error.message}`
    );
  }
};

module.exports = { acquireStopsForSelectedRoute };
