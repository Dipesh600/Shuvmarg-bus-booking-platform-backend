const { createTripDiscoveryController } = require("./trip-discovery.controller");
const { createTripDiscoveryService } = require("./trip-discovery.service");
const repository = require("./trip-discovery.repository");
const { createRouteResolver } = require("./trip-discovery-route-resolver");
const { createStopSelectionResolver } = require("./stop-selection-resolver");
const { buildTripQuery } = require("./trip-discovery-query");
const { createTripMapper } = require("./trip-discovery-mapper");
const { timeToMins } = require("./trip-discovery-time");
const { getPresignedUrl } = require("../../../services/s3Service");

const { resolveRouteCandidates } = createRouteResolver({ repository });
const { mapTripResponse } = createTripMapper({ getPresignedUrl, timeToMins });
const stopSelectionResolver = createStopSelectionResolver({ repository });

const { searchTripsService } = createTripDiscoveryService({
  resolveRouteCandidates,
  buildTripQuery,
  countTrips: repository.countTrips,
  findTripsWithPopulate: repository.findTripsWithPopulate,
  getSeatAvailabilityMap: repository.getSeatAvailabilityMap,
  mapTripResponse,
});

const { searchTrips } = createTripDiscoveryController({
  searchTripsService,
  stopSelectionResolver,
  logger: console,
});

module.exports = {
  searchTrips,
};
