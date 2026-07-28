"use strict";

const {
  CODE_APPLICATION_WINDOW_HOURS,
  TOTAL_REFERRAL_REWARD,
  UNLOCK_SCHEDULE,
} = require("./referral-reward.constants");

const validateReferralCreation = ({
  referrerId,
  referredUserId,
  referrer,
  referredUser,
  now = Date.now(),
}) => {
  if (referrerId.toString() === referredUserId.toString()) {
    throw new Error("You cannot refer yourself.");
  }
  if (!referrer) throw new Error("Referrer not found.");
  if (!referredUser) throw new Error("Referred user not found.");
  if (referredUser.referredBy) {
    throw new Error("This user already has a referral code applied.");
  }
  const signupTime = new Date(referredUser.createdAt).getTime();
  const hoursSinceSignup = (now - signupTime) / (1000 * 60 * 60);
  if (hoursSinceSignup > CODE_APPLICATION_WINDOW_HOURS) {
    throw new Error(
      "Referral code can only be applied within 24 hours of signing up."
    );
  }
};

const validateJourneyUnlock = ({ referral, booking, referredUserId, bookingId }) => {
  if (!referral || !booking || booking.status === "cancelled") return null;
  if (booking.userId.toString() !== referredUserId.toString()) return null;
  if ((booking.totalAmount || 0) < 1 || referral.journeysCompleted >= 5) {
    return null;
  }
  const duplicate = referral.unlockHistory.some(
    (entry) => entry.bookingId.toString() === bookingId.toString()
  );
  if (duplicate) return null;
  const journeyNumber = referral.journeysCompleted + 1;
  const amountUnlocked = UNLOCK_SCHEDULE[journeyNumber];
  if (!amountUnlocked) return null;
  const totalUnlocked = referral.totalUnlocked + amountUnlocked;
  return {
    journeyNumber,
    amountUnlocked,
    totalUnlocked,
    lockedRemaining: TOTAL_REFERRAL_REWARD - totalUnlocked,
    status:
      journeyNumber >= 5 ? "FULLY_UNLOCKED" : "PARTIALLY_UNLOCKED",
  };
};

module.exports = {
  validateReferralCreation,
  validateJourneyUnlock,
};
