"use strict";

const mongoose = require("mongoose");
const Stop = require("../../../../models/stopModel.js");
const { fleetRouteError } = require("./fleet-route-errors.js");

async function loadEndpointScope(stopId) {
  if (!mongoose.isValidObjectId(stopId)) {
    throw fleetRouteError("INVALID_ROUTE_ENDPOINT", "Select a valid route endpoint.");
  }
  const scope = [];
  const seen = new Set();
  let currentId = stopId;
  while (currentId && scope.length < 12) {
    const key = String(currentId);
    if (seen.has(key)) break;
    seen.add(key);
    const stop = await Stop.findOne({
      _id: currentId, status: "ACTIVE", verificationStatus: "VERIFIED",
    }).select("name code parentStopId isSearchable isRouteStop coordinates district province municipality").lean();
    if (!stop) {
      if (scope.length === 0) {
        throw fleetRouteError("ROUTE_ENDPOINT_UNAVAILABLE", "The selected route endpoint is unavailable.", 409);
      }
      break;
    }
    scope.push(stop);
    currentId = stop.parentStopId;
  }
  return scope;
}

module.exports = { loadEndpointScope };
