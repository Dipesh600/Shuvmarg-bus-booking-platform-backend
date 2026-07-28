const createPassengerBookingHistoryService = (repository, mapper, imageService) => {
  const getPassengerBookingHistory = async (userId) => {
    const bookings = await repository.findBookings(userId);
    const bookingIds = bookings.map((b) => b._id);

    const transactions = await repository.findTransactions(bookingIds);
    const transactionByBookingId = new Map(
      transactions.map((t) => [String(t.bookingId), t])
    );

    const foundReviews = await repository.findReviews(userId, bookingIds);
    const reviewedSet = new Set(foundReviews.map((r) => String(r.bookingId)));

    const refunds = await repository.findRefunds(bookingIds);
    const refundByBookingId = new Map(
      refunds.map((r) => [String(r.bookingId), r])
    );

    const result = await Promise.all(bookings.map(async (booking) => {
      const transaction = transactionByBookingId.get(String(booking._id)) || null;
      const refund = refundByBookingId.get(String(booking._id)) || null;

      let presignedImages = [];
      if (booking.tripId && booking.tripId.busId) {
        const rawImages = booking.tripId.busId.fleetImages || [];
        presignedImages = await imageService(rawImages);
      }

      return mapper.mapToPassengerHistory(
        booking,
        transaction,
        refund,
        reviewedSet,
        presignedImages
      );
    }));

    return result;
  };

  return { getPassengerBookingHistory };
};

module.exports = {
  createPassengerBookingHistoryService,
};
