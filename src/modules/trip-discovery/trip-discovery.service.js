function createTripDiscoveryService({ resolveRouteCandidates, buildTripQuery, countTrips, findTripsWithPopulate, getSeatAvailabilityMap, mapTripResponse }) {
  async function searchTripsService({ from, to, date, shift, page, limit, identitySelection }) {
    const skip = (page - 1) * limit;

    // 1. Resolve stops and routes
    const resolution = await resolveRouteCandidates(from, to, identitySelection);

    const searchMeta = identitySelection?.isIdentityMode
      ? {
          from: identitySelection.fromScope.metadata,
          to: identitySelection.toScope.metadata,
        }
      : {
          from: { name: resolution.resolvedFromName || from || "" },
          to: { name: resolution.resolvedToName || to || "" },
        };

    if (resolution.legacyRouteIds.length === 0 && resolution.variantIds.length === 0) {
      return {
        results: 0,
        total: 0,
        page: 1,
        totalPages: 0,
        search: searchMeta,
        data: [],
        noRoutes: true
      };
    }

    // 2. Build query
    const tripQuery = buildTripQuery(resolution.legacyRouteIds, resolution.variantIds, date, shift);

    // 3. Count
    const total = await countTrips(tripQuery);

    // 4. Fetch trips
    const trips = await findTripsWithPopulate(tripQuery, skip, limit);

    // 5. Seat availability
    const tripIds = trips.map(t => t._id);
    const seatAvailabilityMap = await getSeatAvailabilityMap(tripIds);

    // 6. Map response
    const validTrips = await mapTripResponse(
      trips,
      seatAvailabilityMap,
      resolution.originStopIds,
      resolution.destStopIds,
      resolution.resolvedFromName,
      resolution.resolvedToName
    );

    return {
      results: validTrips.length,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      search: searchMeta,
      data: validTrips,
      noRoutes: false
    };
  }

  return { searchTripsService };
}

module.exports = {
  createTripDiscoveryService
};
