'use strict';

module.exports = function createCheckoutTripQuery(Trip) {
  return function findCheckoutTrip(tripId) {
    return Trip.findById(tripId)
      .select('busId routeId variantId scheduleId fromStopName toStopName departureTime arrivalTime')
      .populate({
        path: 'busId',
        select: 'boardingPointId',
        populate: {
          path: 'boardingPointId',
          select: 'boardingPoints droppingPoints -_id',
        },
      })
      .populate('routeId', 'from to -_id')
      .populate({
        path: 'variantId',
        select: 'direction corridorId',
        populate: {
          path: 'corridorId',
          select: 'originId destinationId',
          populate: [
            { path: 'originId', select: 'name -_id' },
            { path: 'destinationId', select: 'name -_id' },
          ],
        },
      })
      .populate({
        path: 'scheduleId',
        select: 'operatorRouteConfigId',
        populate: {
          path: 'operatorRouteConfigId',
          select: 'boardingConfig timingConfig returnBoardingConfig returnTimingConfig',
          populate: [
            {
              path: 'boardingConfig.stopId returnBoardingConfig.stopId',
              select: 'name',
            },
            {
              path: 'boardingConfig.boardingPointIds returnBoardingConfig.boardingPointIds',
              select: 'pointName type -_id',
            },
          ],
        },
      })
      .lean();
  };
};
