"use strict";

function createBookingFinancialRepository({ Booking }) {
  return {
    thisMonth(start) {
      return Booking.aggregate([
        { $match: { status: "booked", createdAt: { $gte: start } } },
        { $group: {
          _id: null,
          gbv: { $sum: "$totalAmount" },
          count: { $sum: 1 },
          seats: { $sum: { $size: "$seats" } },
          discount: { $sum: "$discountAmount" },
          gatewayFees: { $sum: {
            $multiply: [
              "$totalAmount", { $divide: ["$gatewayFeeRate", 100] },
            ],
          } },
        } },
      ]);
    },
    lastMonth(start, end) {
      return Booking.aggregate([
        { $match: {
          status: "booked",
          createdAt: { $gte: start, $lte: end },
        } },
        { $group: {
          _id: null,
          gbv: { $sum: "$totalAmount" },
          count: { $sum: 1 },
        } },
      ]);
    },
    allTime() {
      return Booking.aggregate([
        { $match: { status: "booked" } },
        { $group: {
          _id: null,
          gbv: { $sum: "$totalAmount" },
          count: { $sum: 1 },
          original: { $sum: "$originalAmount" },
          discount: { $sum: "$discountAmount" },
          seats: { $sum: { $size: "$seats" } },
          avgTicket: { $avg: "$totalAmount" },
        } },
      ]);
    },
    statusDistribution() {
      return Booking.aggregate([
        { $group: {
          _id: "$status",
          count: { $sum: 1 },
          value: { $sum: "$totalAmount" },
        } },
        { $sort: { count: -1 } },
      ]);
    },
    couponImpact() {
      return Booking.aggregate([
        { $match: { status: "booked", couponUsed: { $ne: null } } },
        { $group: {
          _id: null,
          couponBookings: { $sum: 1 },
          couponDiscount: { $sum: "$discountAmount" },
          couponRevenue: { $sum: "$totalAmount" },
        } },
      ]);
    },
    gatewayBreakdown(thisMonthStart) {
      return Booking.aggregate([
        { $match: { status: "booked" } },
        { $group: {
          _id: "$gateway",
          count: { $sum: 1 },
          total: { $sum: "$totalAmount" },
          original: { $sum: "$originalAmount" },
          avgTicket: { $avg: "$totalAmount" },
          thisMonth: { $sum: { $cond: [
            { $gte: ["$createdAt", thisMonthStart] },
            "$totalAmount",
            0,
          ] } },
        } },
        { $sort: { total: -1 } },
      ]);
    },
    operatorLeaderboard(thisMonthStart) {
      return Booking.aggregate([
        { $match: { status: "booked" } },
        { $group: {
          _id: "$brandId",
          gbv: { $sum: "$totalAmount" },
          count: { $sum: 1 },
          discount: { $sum: "$discountAmount" },
          seats: { $sum: { $size: "$seats" } },
          thisMonth: { $sum: { $cond: [
            { $gte: ["$createdAt", thisMonthStart] },
            "$totalAmount",
            0,
          ] } },
        } },
        { $sort: { gbv: -1 } },
        { $limit: 8 },
        { $lookup: {
          from: "operatorbrands",
          localField: "_id",
          foreignField: "_id",
          as: "brand",
        } },
        { $unwind: {
          path: "$brand",
          preserveNullAndEmptyArrays: true,
        } },
      ]);
    },
    monthlyBookings(start) {
      return Booking.aggregate([
        { $match: {
          status: "booked",
          createdAt: { $gte: start },
        } },
        { $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
          },
          gbv: { $sum: "$totalAmount" },
          bookings: { $sum: 1 },
          discount: { $sum: "$discountAmount" },
        } },
        { $sort: { "_id.year": 1, "_id.month": 1 } },
      ]);
    },
    countAll() {
      return Booking.countDocuments({});
    },
    countCancelled() {
      return Booking.countDocuments({ status: "cancelled" });
    },
  };
}

module.exports = { createBookingFinancialRepository };
