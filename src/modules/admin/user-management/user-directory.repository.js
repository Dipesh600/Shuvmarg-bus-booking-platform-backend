"use strict";

const USER_FIELDS =
  "name email phone address gender role roles status profilePicture referralCode totalReferrals isVerified lastLoginAt createdAt";

function createUserDirectoryRepository({ User, Booking }) {
  async function findUsers(query, page, limit) {
    const skip = (page - 1) * limit;
    return Promise.all([
      User.find(query)
        .select(USER_FIELDS)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(query),
      Booking.aggregate([
        { $match: { status: "booked" } },
        {
          $group: {
            _id: "$userId",
            bookingCount: { $sum: 1 },
            totalSpent: { $sum: "$totalAmount" },
          },
        },
      ]),
    ]);
  }

  return { findUsers };
}

module.exports = { createUserDirectoryRepository, USER_FIELDS };
