"use strict";

const Trip = require("../../../../models/tripModel");
const Booking = require("../../../../models/bookTicketModel");
const Refund = require("../../../../models/refundModel");

const exceptionCondition = [
  { exceptionType: { $in: ["CANCELLED", "RESCHEDULED", "EXTRA_RUN"] } },
  { status: "cancelled" },
];

const findExceptionTrips = (query, { skip, limit }) =>
  Trip.find(query)
    .sort({ tripDate: -1, createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate("brandId", "brandName brandCode logo")
    .populate("busId", "busNumber busName")
    .populate("ownerId", "name email")
    .populate("driverId", "fullName phone")
    .populate({
      path: "variantId",
      select: "name direction",
      populate: {
        path: "corridorId",
        select: "originCity destinationCity",
        populate: [
          { path: "originId", select: "name" },
          { path: "destinationId", select: "name" },
        ],
      },
    })
    .lean();

const loadExceptions = async (brandFilter, from, to, pageOptions) => {
  const query = {
    ...brandFilter,
    tripDate: { $gte: from, $lte: to },
    $or: exceptionCondition,
  };
  const [trips, total] = await Promise.all([
    findExceptionTrips(query, pageOptions),
    Trip.countDocuments(query),
  ]);
  return { trips, total };
};

const findStuckTrips = (brandFilter, now) =>
  Trip.find({
    ...brandFilter,
    $or: [
      {
        status: "boarding",
        tripDate: { $lte: new Date(now.getTime() - 3 * 3600000) },
      },
      {
        status: "in-transit",
        actualDepartureTime: {
          $lte: new Date(now.getTime() - 24 * 3600000),
        },
      },
    ],
  })
    .populate("brandId", "brandName brandCode")
    .populate("busId", "busNumber busName")
    .select(
      "tripId tripDate departureTime arrivalTime status brandId busId " +
        "directionLabel fromStopName toStopName"
    )
    .lean();

const countTodayExceptions = (brandFilter, start, end) =>
  Trip.countDocuments({
    ...brandFilter,
    tripDate: { $gte: start, $lte: end },
    $or: exceptionCondition,
  });

const cancelledTripIds = async (brandFilter, from, to) => {
  const trips = await Trip.find({
    ...brandFilter,
    tripDate: { $gte: from, $lte: to },
    status: "cancelled",
  })
    .select("_id")
    .lean();
  return trips.map((trip) => trip._id);
};

const revenueAtRisk = async (tripIds) => {
  if (!tripIds.length) return 0;
  const [result] = await Booking.aggregate([
    { $match: { tripId: { $in: tripIds }, status: "cancelled" } },
    { $group: { _id: null, total: { $sum: "$totalAmount" } } },
  ]);
  return result?.total || 0;
};

const countPendingRefunds = () => Refund.countDocuments({ status: "pending" });

module.exports = {
  loadExceptions,
  findStuckTrips,
  countTodayExceptions,
  cancelledTripIds,
  revenueAtRisk,
  countPendingRefunds,
};
