"use strict";

const RouteDiscovery = require("../../../../models/routeDiscoveryModel.js");
const Stop = require("../../../../models/stopModel.js");
const RouteCorridor = require("../../../../models/routeCorridorModel.js");
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

const resolveCorridorDirection = (corridor, requestedDirection) => {
  const direction = requestedDirection === "RETURN" ? "RETURN" : "FORWARD";
  return {
    direction,
    originStopId: String(direction === "FORWARD" ? corridor.originId : corridor.destinationId),
    destinationStopId: String(direction === "FORWARD" ? corridor.destinationId : corridor.originId),
  };
};

const resolveSessionEndpoints = async (data) => {
  const direction = data.direction === "RETURN" ? "RETURN" : "FORWARD";
  if (data.corridorId) {
    const corridor = await RouteCorridor.findById(data.corridorId)
      .select("originId destinationId status code")
      .lean();
    if (!corridor) throw new Error(`Corridor not found: ${data.corridorId}`);
    if (corridor.status === "INACTIVE") {
      throw new Error(`Corridor "${corridor.code}" is inactive.`);
    }
    return { corridor, ...resolveCorridorDirection(corridor, direction) };
  }
  const { originStopId, destinationStopId } = data;
  if (!originStopId || !destinationStopId) {
    throw new Error("corridorId is required. Legacy originStopId and destinationStopId are also supported.");
  }
  return { corridor: null, direction, originStopId: String(originStopId), destinationStopId: String(destinationStopId) };
};

const createDiscoverySession = async (data, adminId) => {
  const { corridor, direction, originStopId, destinationStopId } =
    await resolveSessionEndpoints(data);
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
    corridorId: corridor?._id || null,
    direction,
    originStopId,
    destinationStopId,
    status: "DRAFT",
    createdBy: adminId,
  });
  setImmediate(() => loadRouteOptions(session, origin, destination));
  return session;
};

module.exports = {
  createDiscoverySession,
  resolveSessionEndpoints,
  resolveCorridorDirection,
};
