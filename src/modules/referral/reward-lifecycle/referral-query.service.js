"use strict";

const formatReferral = (referral) => ({
  id: referral._id,
  referredUser: {
    name: referral.referredUserId?.name || "User",
    phone: referral.referredUserId?.phone,
    joinedAt: referral.referredUserId?.createdAt,
  },
  status: referral.status,
  journeysCompleted: referral.journeysCompleted,
  totalUnlocked: referral.totalUnlocked,
  lockedRemaining: referral.lockedRemaining,
  expiresAt: referral.expiresAt,
  flaggedForReview: referral.flaggedForReview,
  unlockHistory: (referral.unlockHistory || []).map((history) => ({
    journeyNumber: history.journeyNumber,
    amountUnlocked: history.amountUnlocked,
    unlockedAt: history.unlockedAt,
  })),
  createdAt: referral.createdAt,
});

const summarize = (referrals) => ({
  totalReferrals: referrals.length,
  activeReferrals: referrals.filter((referral) =>
    ["ACTIVE", "PARTIALLY_UNLOCKED"].includes(referral.status)
  ).length,
  fullyUnlocked: referrals.filter(
    (referral) => referral.status === "FULLY_UNLOCKED"
  ).length,
  expiredReferrals: referrals.filter(
    (referral) => referral.status === "EXPIRED"
  ).length,
  totalEarned: referrals.reduce(
    (sum, referral) => sum + (referral.totalUnlocked || 0),
    0
  ),
  totalLocked: referrals.reduce(
    (sum, referral) =>
      sum +
      (["ACTIVE", "PARTIALLY_UNLOCKED"].includes(referral.status)
        ? referral.lockedRemaining
        : 0),
    0
  ),
});

const createReferralQueryService = ({ repository }) => ({
  getReferralDashboard: async (referrerId) => {
    const user = await repository.findDashboardUser(referrerId);
    if (!user) throw new Error("User not found.");
    const referrals = await repository.findReferralsForDashboard(referrerId);
    return {
      referralCode: user.referralCode,
      summary: summarize(referrals),
      referrals: referrals.map(formatReferral),
    };
  },
  getReferralStatus: async (referredUserId) => {
    const referral = await repository.findReferralStatus(referredUserId);
    if (!referral) return null;
    return {
      referrerName: referral.referrerId?.name || "A friend",
      status: referral.status,
      journeysCompleted: referral.journeysCompleted,
      totalUnlocked: referral.totalUnlocked,
      lockedRemaining: referral.lockedRemaining,
    };
  },
});

module.exports = {
  createReferralQueryService,
  formatReferral,
  summarize,
};
