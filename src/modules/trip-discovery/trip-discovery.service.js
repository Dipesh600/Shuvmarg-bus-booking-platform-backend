function createTripDiscoveryService({ resolveRouteCandidates, buildTripQuery, countTrips, findTripsWithPopulate, getSeatAvailabilityMap, mapTripResponse }) {
  async function searchTripsService({ from, to, date, shift, page, limit }) {
    const skip = (page - 1) * limit;

    // 1. Resolve stops and routes
    const resolution = await resolveRouteCandidates(from, to);
    
    if (resolution.legacyRouteIds.length === 0 && resolution.variantIds.length === 0 && from && to) {
      return {
        results: 0,
        total: 0,
        page: 1,
        totalPages: 0,
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
      data: validTrips,
      noRoutes: false
    };
  }

  return { searchTripsService };
}

module.exports = {
  createTripDiscoveryService
};
