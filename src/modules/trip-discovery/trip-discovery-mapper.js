const { resolveStopTiming } = require("./trip-discovery-stop-timing");
const { collectAmenityNames } = require("./trip-discovery-amenities");

function createTripMapper({ getPresignedUrl, timeToMins }) {
  async function mapTripResponse(
    trips, seatAvailabilityMap, originStopIds, destStopIds,
    resolvedFromName, resolvedToName, selectedOriginStopId, selectedDestinationStopId
  ) {
    const formattedTrips = await Promise.all(trips
      .filter(trip => trip.busId != null)  // Extra null guard after populate
      .map(async trip => {
        const amenities = collectAmenityNames(trip.busId);

        let boardingPoints = [];
        let droppingPoints = [];
        if (trip.busId?.boardingPointId) {
          boardingPoints = trip.busId.boardingPointId.boardingPoints || [];
          droppingPoints = trip.busId.boardingPointId.droppingPoints || [];
        }

        const effectivePrice = (trip.tripFare !== null && trip.tripFare !== undefined)
          ? trip.tripFare
          : (trip.routeId?.basePrice ?? 0);

        // Convert S3 keys to presigned URLs for the frontend
        const rawImages = trip.busId.fleetImages || [];
        const presignedImages = await Promise.all(
          rawImages.map(key => getPresignedUrl(key))
        );

        const busDetail = {
          _id: trip.busId._id,
          busName: trip.busId.busName,
          busNumber: trip.busId.busNumber,
          busType: trip.busId.busType,
          vehicleType: trip.busId.vehicleType,
          totalSeats: trip.busId.totalSeats,
          seatLayout: trip.busId.seatLayout,
          fleetImages: presignedImages.filter(Boolean),
          averageRating: trip.busId.averageRating || 0,
          totalReviews: trip.busId.totalReviews || 0,
          amenities,
          boardingPoints,
          droppingPoints,
        };

        let routeDetail = null;
        if (trip.routeId) {
          routeDetail = {
            _id: trip.routeId._id,
            routeName: trip.routeId.routeName,
            from: trip.routeId.from,
            to: trip.routeId.to,
            distance: trip.routeId.distance,
            duration: trip.routeId.duration,
            distanceKm: trip.routeId.distanceKm,
            durationMinutes: trip.routeId.durationMinutes,
          };
        } else if (trip.variantId) {
          const corridorOrigin = trip.variantId.corridorId?.originId?.name;
          const corridorDest   = trip.variantId.corridorId?.destinationId?.name;
          const isReturnVariant = trip.variantId.direction === "RETURN";

          let displayFrom = isReturnVariant ? (corridorDest || trip.toStopName)   : (corridorOrigin || trip.fromStopName);
          let displayTo   = isReturnVariant ? (corridorOrigin || trip.fromStopName) : (corridorDest   || trip.toStopName);

          if (resolvedFromName) displayFrom = resolvedFromName;
          if (resolvedToName)   displayTo   = resolvedToName;

          routeDetail = {
            _id: trip.variantId._id,
            routeName: trip.variantId.name || `${displayFrom} - ${displayTo}`,
            from: displayFrom,
            to:   displayTo,
            distance: null,
            duration: null,
            distanceKm:      trip.variantId.corridorId?.distanceKm      || 0,
            durationMinutes: trip.variantId.corridorId?.durationMinutes || 0,
          };
        }

        const availableSeats = seatAvailabilityMap[trip._id.toString()] ?? 0;

        const {
          resolvedDepartureTime,
          resolvedArrivalTime,
          resolvedOriginStopId,
          resolvedDestinationStopId,
          failsStopBehaviorGate
        } = resolveStopTiming({ trip, originStopIds, destStopIds, timeToMins });

        if (failsStopBehaviorGate) return null;

        return {
          _id: trip._id,
          tripId: trip.tripId,
          tripDate: trip.tripDate,
          departureTime: resolvedDepartureTime,
          arrivalTime:   resolvedArrivalTime,
          tripFare: effectivePrice,
          shift: trip.shift,
          status: trip.status,
          busDetail,
          routeDetail,
          boardingContext: resolvedOriginStopId && resolvedDestinationStopId
            ? {
                originStopId: resolvedOriginStopId,
                destinationStopId: resolvedDestinationStopId,
                originSelectionStopId: selectedOriginStopId || resolvedOriginStopId,
                destinationSelectionStopId:
                  selectedDestinationStopId || resolvedDestinationStopId,
              }
            : null,
          availableSeats,
        };
      }));

    return formattedTrips.filter(Boolean);
  }

  return { mapTripResponse };
}

module.exports = {
  createTripMapper
};
