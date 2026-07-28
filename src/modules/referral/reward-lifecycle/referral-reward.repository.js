"use strict";

const createReferralRewardRepository = ({
  Referral,
  User,
  Booking,
  SMLedger,
}) => ({
  findUsers: (referrerId, referredUserId) =>
    Promise.all([
      User.findById(referrerId).lean(),
      User.findById(referredUserId).lean(),
    ]),
  findCompletedJourney: (userId) =>
    Booking.findOne({ userId, status: "booked" })
      .populate({
        path: "tripId",
        match: { status: "completed" },
        select: "_id status",
      })
      .lean(),
  createReferral: (data, session) =>
    Referral.create([data], { session }).then(([referral]) => referral),
  tagReferredUser: (referredUserId, referrerId, session) =>
    User.updateOne(
      { _id: referredUserId },
      { $set: { referredBy: referrerId } },
      { session }
    ),
  findActiveReferral: (referredUserId) =>
    Referral.findOne({
      referredUserId,
      status: { $in: ["ACTIVE", "PARTIALLY_UNLOCKED"] },
    }),
  findBooking: (bookingId) => Booking.findById(bookingId).lean(),
  updateUnlock: (referralId, progress, history, session) =>
    Referral.updateOne(
      { _id: referralId },
      {
        $set: {
          journeysCompleted: progress.journeyNumber,
          totalUnlocked: progress.totalUnlocked,
          lockedRemaining: progress.lockedRemaining,
          status: progress.status,
        },
        $push: { unlockHistory: history },
      },
      { session }
    ),
  markLockedLedger: (entryId, status, session) =>
    SMLedger.updateOne(
      { _id: entryId },
      { $set: { status } },
      { session }
    ),
  findReferrerName: (userId) =>
    User.findById(userId).select("name").lean(),
  findDashboardUser: (userId) =>
    User.findById(userId).select("referralCode name").lean(),
  findReferralsForDashboard: (referrerId) =>
    Referral.find({ referrerId })
      .populate("referredUserId", "name phone createdAt")
      .sort({ createdAt: -1 })
      .lean(),
  findReferralStatus: (referredUserId) =>
    Referral.findOne({ referredUserId })
      .populate("referrerId", "name")
      .lean(),
  findReferralById: (referralId) => Referral.findById(referralId),
  countRecent: (referrerId, windowStart) =>
    Referral.countDocuments({
      referrerId,
      createdAt: { $gte: windowStart },
    }),
  flagRecent: (referrerId, windowStart, flagReason) =>
    Referral.updateMany(
      {
        referrerId,
        createdAt: { $gte: windowStart },
        flaggedForReview: false,
      },
      { $set: { flaggedForReview: true, flagReason } }
    ),
});

module.exports = { createReferralRewardRepository };
