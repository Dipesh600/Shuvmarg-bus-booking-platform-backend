"use strict";

const Trip = require("../../../../models/tripModel");
const Booking = require("../../../../models/bookTicketModel");
const Schedule = require("../../../../models/scheduleModel");

const findSchedules = (brandFilter) =>
  Schedule.find({
    ...brandFilter,
    status: { $in: ["ACTIVE", "SUSPENDED"] },
  })
    .populate("brandId", "brandName brandCode logo")
    .populate("busId", "busNumber busName totalSeats")
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

const aggregateTrips = (scheduleIds, windowStart, now) =>
  Trip.aggregate([
    {
      $match: {
        scheduleId: { $in: scheduleIds },
        tripDate: { $gte: windowStart, $lte: now },
      },
    },
    {
      $group: {
        _id: "$scheduleId",
        totalTrips: { $sum: 1 },
        completedTrips: {
          $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
        },
        cancelledTrips: {
          $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] },
        },
        inTransitTrips: {
          $sum: { $cond: [{ $eq: ["$status", "in-transit"] }, 1, 0] },
        },
        scheduledTrips: {
          $sum: { $cond: [{ $eq: ["$status", "scheduled"] }, 1, 0] },
        },
        boardingTrips: {
          $sum: { $cond: [{ $eq: ["$status", "boarding"] }, 1, 0] },
        },
        tripIds: { $push: "$_id" },
      },
    },
  ]);

const aggregateBookings = (tripIds) =>
  Booking.aggregate([
    {
      $match: {
        tripId: { $in: tripIds },
        status: { $in: ["booked", "no_show"] },
      },
    },
    {
      $group: {
        _id: "$tripId",
        seatsSold: { $sum: { $size: "$seats" } },
        revenue: { $sum: "$totalAmount" },
        bookings: { $sum: 1 },
      },
    },
  ]);

module.exports = { findSchedules, aggregateTrips, aggregateBookings };
