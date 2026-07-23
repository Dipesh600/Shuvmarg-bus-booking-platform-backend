const { createTripDiscoveryController } = require("./trip-discovery.controller");
const { createTripDiscoveryService } = require("./trip-discovery.service");
const repository = require("./trip-discovery.repository");
const { createRouteResolver } = require("./trip-discovery-route-resolver");
const { buildTripQuery } = require("./trip-discovery-query");
const { createTripMapper } = require("./trip-discovery-mapper");
const { getPresignedUrl } = require("../../../services/s3Service");

const { resolveRouteCandidates } = createRouteResolver({ repository });
const { mapTripResponse } = createTripMapper({ getPresignedUrl });
const { searchTripsService } = createTripDiscoveryService({
  resolveRouteCandidates,
  buildTripQuery,
  countTrips: repository.countTrips,
  findTripsWithPopulate: repository.findTripsWithPopulate,
  getSeatAvailabilityMap: repository.getSeatAvailabilityMap,
  mapTripResponse
});

const { searchTrips } = createTripDiscoveryController({ searchTripsService });

module.exports = {
  searchTrips
};
