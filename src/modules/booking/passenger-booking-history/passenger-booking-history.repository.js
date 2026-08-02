const Booking = require("../../../../models/bookTicketModel");
const Transaction = require("../../../../models/transactionModel");
const Review = require("../../../../models/reviewModel");
const Refund = require("../../../../models/refundModel");

const findBookings = async (userId) => {
  return Booking.find({ userId: userId })
    .populate({
      path: "tripId",
      populate: [
        {
          path: "busId",
          select:
            "busName busNumber busType vehicleType totalSeats seatLayout amenitiesId amenityIds boardingPointId fleetImages",
          populate: [
            {
              path: "amenitiesId",
              select: "name icon type description",
            },
            {
              path: "amenityIds",
              select: "name icon type description",
            },
            {
              path: "boardingPointId",
              select: "city boardingPoints description",
            },
          ],
        },
        {
          path: "routeId",
          select: "routeName from to distance duration basePrice",
        },
      ],
    })
    .lean();
};

const findTransactions = async (bookingIds) => {
  return Transaction.find({
    bookingId: { $in: bookingIds },
  })
    .select({
      bookingId: 1,
      gateway: 1,
      transactionId: 1,
      status: 1,
      totalAmount: 1,
      paidAt: 1,
    })
    .lean();
};

const findReviews = async (userId, bookingIds) => {
  return Review.find({
    userId: userId,
    bookingId: { $in: bookingIds },
  })
    .select({ bookingId: 1 })
    .lean();
};

const findRefunds = async (bookingIds) => {
  return Refund.find({
    bookingId: { $in: bookingIds },
  })
    .select({
      bookingId: 1,
      originalAmount: 1,
      cancellationCharge: 1,
      refundAmount: 1,
      status: 1,
      requestedAt: 1,
      processedAt: 1,
      completedAt: 1,
      reason: 1,
      remarks: 1,
      refundGateway: 1,
    })
    .lean();
};

module.exports = {
  findBookings,
  findTransactions,
  findReviews,
  findRefunds,
};
