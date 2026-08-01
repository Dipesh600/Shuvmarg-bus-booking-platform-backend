"use strict";

const RouteStop = require("../../../../models/routeStopModel.js");
const BoardingPoint = require("../../../../models/boardingPointsModel.js");
const BoardingLocation = require("../../../../models/boardingLocationModel.js");
const OperatorRouteConfig = require(
  "../../../../models/operatorRouteConfigModel.js"
);

async function getStopReferenceCounts(id) {
  const [
    operatorRouteCount, routeStopCount,
    boardingPointCount, boardingLocationCount,
  ] = await Promise.all([
    OperatorRouteConfig.countDocuments({
      $or: [
        { activeStops: id }, { returnActiveStops: id },
        { "boardingConfig.stopId": id }, { "timingConfig.stopId": id },
        { "returnBoardingConfig.stopId": id },
        { "returnTimingConfig.stopId": id },
      ],
    }),
    RouteStop.countDocuments({ stopId: id }),
    BoardingPoint.countDocuments({ stopId: id }),
    BoardingLocation.countDocuments({ stopId: id }),
  ]);
  return {
    operatorRouteCount, routeStopCount,
    boardingPointCount, boardingLocationCount,
  };
}

function hasStopReferences(counts) {
  return Object.values(counts).some((count) => count > 0);
}

module.exports = { getStopReferenceCounts, hasStopReferences };
