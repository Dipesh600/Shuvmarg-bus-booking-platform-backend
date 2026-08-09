"use strict";

const RouteStop = require("../../../../models/routeStopModel.js");
const Stop = require("../../../../models/stopModel.js");

async function assertVariantCanActivate(variant) {
  const sequence = await RouteStop.find({ variantId: variant._id })
    .sort({ sequence: 1 }).lean();
  if (sequence.length < 2) {
    throw new Error("A variant needs at least two ordered route stops before activation.");
  }
  const originId = variant.direction === "RETURN"
    ? variant.corridorId.destinationId : variant.corridorId.originId;
  const destinationId = variant.direction === "RETURN"
    ? variant.corridorId.originId : variant.corridorId.destinationId;
  if (String(sequence[0].stopId) !== String(originId) ||
      String(sequence.at(-1).stopId) !== String(destinationId)) {
    throw new Error("The variant sequence must begin and end at its directional corridor endpoints.");
  }
  const stopIds = sequence.map((row) => row.stopId);
  const validStops = await Stop.countDocuments({
    _id: { $in: stopIds }, status: "ACTIVE", isRouteStop: true,
  });
  if (validStops !== stopIds.length) {
    throw new Error("Every variant sequence item must be an active operational route stop.");
  }
}

module.exports = { assertVariantCanActivate };
