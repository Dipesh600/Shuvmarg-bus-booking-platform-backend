"use strict";

const { KYC_REVIEW_STATUS } = require("./kyc-review.policy");

async function syncReviewedOwnerUser({ userId, targetStatus, User, logger = console }) {
  if (!userId || !User) return null;

  try {
    let updateDoc = null;
    if (targetStatus === KYC_REVIEW_STATUS.APPROVED) {
      updateDoc = { $set: { status: "active", isVerified: true } };
    } else if (targetStatus === KYC_REVIEW_STATUS.REJECTED) {
      updateDoc = { $set: { isVerified: false } };
    }

    if (!updateDoc) return null;

    if (typeof User.findByIdAndUpdate === "function") {
      let q = User.findByIdAndUpdate(userId, updateDoc, { new: true });
      if (q && typeof q.lean === "function") {
        q = q.lean();
      }
      return await q;
    }
    return null;
  } catch (err) {
    logger.error("KYC review user sync error:", err);
    throw err;
  }
}

module.exports = { syncReviewedOwnerUser };
