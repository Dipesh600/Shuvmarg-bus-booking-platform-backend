const mapToPassengerHistory = (booking, transaction, refund, reviewedSet, presignedImages) => {
  let trip = booking.tripId || null;

  if (trip && trip.busId) {
    const bus = trip.busId;

    trip.busId = {
      ...bus,
      fleetImages: presignedImages,
      amenitiesDetail: Array.isArray(bus.amenityIds) && bus.amenityIds.length > 0
        ? bus.amenityIds
        : bus.amenitiesId || null,
      boardingPointDetail: bus.boardingPointId || null,
      amenitiesId: undefined,
      boardingPointId: undefined,
    };
  }

  if (trip) {
    const baseRouteDetail = trip.routeId
      ? trip.routeId
      : {
          _id: trip.variantId || null,
          routeName: trip.directionLabel || `${trip.fromStopName || "?"} → ${trip.toStopName || "?"}`,
          from: trip.fromStopName || "N/A",
          to: trip.toStopName || "N/A",
        };

    const routeDetail = {
      ...baseRouteDetail,
      from: booking.bookedFrom || baseRouteDetail.from,
      to: booking.bookedTo || baseRouteDetail.to,
    };

    trip = {
      ...trip,
      departureTime: booking.bookedDepartureTime || trip.departureTime,
      arrivalTime: booking.bookedArrivalTime || trip.arrivalTime,
      routeDetail,
      routeId: undefined,
    };
  }

  return {
    booking: {
      seats: booking.seats,
      totalAmount: booking.totalAmount,
      status: booking.status,
      refundStatus: refund?.status || booking.refundStatus || "",
      refundAmount: refund?.refundAmount || booking.refundAmount || 0,
      ticketId: booking.ticketId,
      bookingId: booking._id,
      review: reviewedSet.has(String(booking._id)),
    },
    trip,
    payment: transaction
      ? {
          gateway: transaction.gateway,
          transactionId: transaction.transactionId,
          status: transaction.status,
          totalAmount: transaction.totalAmount,
          paidAt: transaction.paidAt,
        }
      : null,
    refund: refund
      ? {
          refundAmount: refund.refundAmount,
          cancellationCharge: refund.cancellationCharge,
          originalAmount: refund.originalAmount,
          status: refund.status,
          requestedAt: refund.requestedAt,
          processedAt: refund.processedAt,
          completedAt: refund.completedAt,
          reason: refund.reason,
          remarks: refund.remarks,
          refundGateway: refund.refundGateway,
          destination: refund.destination,
        }
      : null,
  };
};

module.exports = {
  mapToPassengerHistory,
};
