"use strict";

const { KYC_REVIEW_STATUS } = require("./kyc-review.policy");

async function syncReviewedOwnerUser({ userId, targetStatus, User, logger = console }) {
  if (!userId || !User) return;

  try {
    if (targetStatus === KYC_REVIEW_STATUS.APPROVED) {
      await User.findByIdAndUpdate(userId, {
        $set: { status: "active", isVerified: true },
      });
    } else if (targetStatus === KYC_REVIEW_STATUS.REJECTED) {
      await User.findByIdAndUpdate(userId, {
        $set: { isVerified: false },
      });
    }
  } catch (err) {
    logger.error("KYC review user sync error:", err);
    throw err;
  }
}

module.exports = { syncReviewedOwnerUser };
