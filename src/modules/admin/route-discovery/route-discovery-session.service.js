"use strict";

const RouteDiscovery = require("../../../../models/routeDiscoveryModel.js");
const Stop = require("../../../../models/stopModel.js");
const {
  extractStopCoordinates,
} = require("../../../../services/mapboxClient.js");
const { fetchGoogleRouteOptions } = require("../../../../services/googleRoutesClient.js");

const loadCoordinates = async (stop, sessionId, label) => {
  let coordinates = extractStopCoordinates(stop);
  if (coordinates) return coordinates;
  throw new Error(
    `${label} stop "${stop.name}" has no verified map coordinates. Add its location in the Stop Registry before creating a variant draft.`
  );
};

const loadRouteOptions = async (session, origin, destination) => {
  try {
    const originCoords = await loadCoordinates(origin, session._id, "origin");
    const destinationCoords = await loadCoordinates(
      destination,
      session._id,
      "destination"
    );
    const routeOptions = await fetchGoogleRouteOptions(originCoords, destinationCoords);
    await RouteDiscovery.findByIdAndUpdate(session._id, {
      routeOptions,
      errorMessage: null,
    });
    console.log(
      `[Discovery] Session ${session._id}: ${routeOptions.length} route option(s) loaded from Google Routes.`
    );
  } catch (error) {
    console.error(
      `[Discovery] Session ${session._id}: Google Routes fetch failed — ${error.message}`
    );
    await RouteDiscovery.findByIdAndUpdate(session._id, {
      errorMessage: error.message,
    }).catch(() => {});
  }
};

const createDiscoverySession = async (data, adminId) => {
  const { originStopId, destinationStopId } = data;
  if (!originStopId || !destinationStopId) {
    throw new Error("originStopId and destinationStopId are required.");
  }
  if (originStopId === destinationStopId) {
    throw new Error("Origin and destination cannot be the same stop.");
  }
  const [origin, destination] = await Promise.all([
    Stop.findById(originStopId).select("name code status coordinates").lean(),
    Stop.findById(destinationStopId).select("name code status coordinates").lean(),
  ]);
  if (!origin) throw new Error(`Origin stop not found: ${originStopId}`);
  if (!destination) throw new Error(`Destination stop not found: ${destinationStopId}`);
  if (origin.status !== "ACTIVE") {
    throw new Error(`Origin stop "${origin.name}" is not active.`);
  }
  if (destination.status !== "ACTIVE") {
    throw new Error(`Destination stop "${destination.name}" is not active.`);
  }
  const existingActive = await RouteDiscovery.findOne({
    originStopId,
    destinationStopId,
    status: { $in: ["DRAFT", "ROUTE_SELECTED", "STOPS_DISCOVERED", "APPROVED"] },
  }).select("_id status").lean();
  if (existingActive) {
    throw new Error(
      `An active discovery session already exists for ${origin.name} → ${destination.name} ` +
      `(ID: ${existingActive._id}, status: ${existingActive.status}). ` +
      "Complete or reject it before starting a new one."
    );
  }
  const session = await RouteDiscovery.create({
    originStopId,
    destinationStopId,
    status: "DRAFT",
    createdBy: adminId,
  });
  setImmediate(() => loadRouteOptions(session, origin, destination));
  return session;
};

module.exports = { createDiscoverySession };
