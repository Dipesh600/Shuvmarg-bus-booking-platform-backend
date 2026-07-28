"use strict";

function createUserProfileRepository({
  User,
  Booking,
  AdminAuditLog,
  RefreshToken,
  toObjectId,
}) {
  function getUser(id) {
    return User.findById(id)
      .select("-password -otp -otpExpiry -__v")
      .populate("referredBy", "name phone referralCode")
      .lean();
  }

  function getBookingMetrics(userId) {
    return Booking.aggregate([
      { $match: { userId } },
      {
        $facet: {
          total: [{ $count: "count" }],
          completed: [
            { $match: { status: "booked" } },
            { $count: "count" },
          ],
          cancelled: [
            { $match: { status: "cancelled" } },
            { $count: "count" },
          ],
          totalSpent: [
            { $match: { status: "booked" } },
            { $group: { _id: null, sum: { $sum: "$totalAmount" } } },
          ],
          avgPerBooking: [
            { $match: { status: "booked" } },
            { $group: { _id: null, avg: { $avg: "$totalAmount" } } },
          ],
          paymentMethods: [
            { $group: { _id: "$paymentMethod", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
          ],
          topRoutes: [
            {
              $lookup: {
                from: "trips",
                localField: "tripId",
                foreignField: "_id",
                as: "trip",
              },
            },
            { $unwind: { path: "$trip", preserveNullAndEmptyArrays: true } },
            {
              $lookup: {
                from: "routes",
                localField: "trip.routeId",
                foreignField: "_id",
                as: "route",
              },
            },
            { $unwind: { path: "$route", preserveNullAndEmptyArrays: true } },
            {
              $group: {
                _id: "$trip.routeId",
                from: { $first: "$route.from" },
                to: { $first: "$route.to" },
                count: { $sum: 1 },
              },
            },
            { $sort: { count: -1 } },
            { $limit: 5 },
          ],
        },
      },
    ]);
  }

  function getRecentAuditActions(userId) {
    return AdminAuditLog.find({ targetId: userId })
      .sort({ createdAt: -1 })
      .limit(20)
      .populate("adminId", "email role")
      .lean();
  }

  function getProfileContext(id) {
    const userId = toObjectId(id);
    return Promise.all([
      getUser(id),
      getBookingMetrics(userId),
      getRecentAuditActions(userId),
      RefreshToken.countDocuments({ userId }),
    ]);
  }

  return { getProfileContext };
}

module.exports = { createUserProfileRepository };
