const { getPresignedUrl } = require("../../services/s3Service");
const { timeToMins } = require("./trip-discovery-time");

async function mapTripResponse(trips, seatAvailabilityMap, originStopIds, destStopIds, resolvedFromName, resolvedToName) {
  const formattedTrips = await Promise.all(trips
    .filter(trip => trip.busId != null)  // Extra null guard after populate
    .map(async trip => {
      let amenities = [];
      if (trip.busId?.amenitiesId?.amenities) {
        amenities = trip.busId.amenitiesId.amenities.map(a => a.name);
      }

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

      const operatorConfig = trip.scheduleId?.operatorRouteConfigId;
      const isReturnVariant = trip.variantId?.direction === "RETURN";
      const timingArray = operatorConfig
        ? (isReturnVariant
            ? (operatorConfig.returnTimingConfig || operatorConfig.timingConfig)
            : operatorConfig.timingConfig)
        : [];

      let resolvedDepartureTime = trip.departureTime;
      let resolvedArrivalTime   = trip.arrivalTime;
      let failsStopBehaviorGate = false;

      if (timingArray.length > 0) {
        const fromEntry = timingArray.find(tc => originStopIds.has(tc.stopId?.toString()));
        const toEntry   = timingArray.find(tc => destStopIds.has(tc.stopId?.toString()));

        if (fromEntry) {
          const dep = (fromEntry.estimatedDeparture || "").trim();
          const arr = (fromEntry.estimatedArrival   || "").trim();
          if (dep) resolvedDepartureTime = dep;
          else if (arr) resolvedDepartureTime = arr;
        }

        if (toEntry) {
          const arr = (toEntry.estimatedArrival   || "").trim();
          const dep = (toEntry.estimatedDeparture || "").trim();
          if (arr) resolvedArrivalTime = arr;
          else if (dep) resolvedArrivalTime = dep;
        }

        if (fromEntry && !["BOARDING_ONLY", "BOTH"].includes(fromEntry.stopBehavior)) failsStopBehaviorGate = true;
        if (toEntry   && !["DROPPING_ONLY", "BOTH"].includes(toEntry.stopBehavior))   failsStopBehaviorGate = true;

        const operatorMin = operatorConfig?.minimumJourneyMinutes ?? 60;
        if (operatorMin > 0 && fromEntry?.estimatedDeparture && toEntry?.estimatedArrival) {
          const depMins  = timeToMins(fromEntry.estimatedDeparture);
          const arrMins  = timeToMins(toEntry.estimatedArrival);
          const fromDay  = fromEntry.dayOffset || 0;
          const toDay    = toEntry.dayOffset   || 0;
          let actualMins = (arrMins + toDay * 1440) - (depMins + fromDay * 1440);
          if (actualMins < 0) actualMins += 1440;
          if (actualMins < operatorMin) failsStopBehaviorGate = true;
        }
      }

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
        availableSeats,
      };
    }));

  return formattedTrips.filter(Boolean);
}

module.exports = {
  mapTripResponse
};
