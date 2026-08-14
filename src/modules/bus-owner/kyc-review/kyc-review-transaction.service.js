"use strict";

const { KycReviewError } = require("./kyc-review.errors");
const { KYC_REVIEW_STATUS } = require("./kyc-review.policy");
const { syncReviewedOwnerUser } = require("./kyc-review-user-sync.service");

async function executeKycReview({ owner, reviewer, targetStatus, companyName, persistence, BusOwner, User, defaultBrandService, logger, session }) {
  let defaultBrand = null;
  if (targetStatus === KYC_REVIEW_STATUS.APPROVED) {
    try {
      const result = await defaultBrandService.ensureDefaultBrand({ ownerId: owner.user, companyName, adminId: reviewer._id, session });
      defaultBrand = result?.brand || null;
      logger.info(`[KycReview] Default brand ensured for owner ${owner.user} (brandId: ${defaultBrand?._id || defaultBrand?.id})`);
    } catch (error) {
      if (error?.hasErrorLabel?.("TransientTransactionError")) throw error;
      logger.error("KYC review default brand provisioning failed for owner:", owner.user, error);
      throw new KycReviewError("KYC_REVIEW_DEFAULT_BRAND_FAILED", "Failed to provision default operator brand upon KYC approval.", 500);
    }
  }
  const options = { new: true, runValidators: true, ...(session ? { session } : {}) };
  const updatedOwner = await BusOwner.findOneAndUpdate(
    { _id: owner._id, verificationStatus: KYC_REVIEW_STATUS.PENDING },
    { $set: persistence.updateFields, $push: { kycAuditHistory: persistence.auditEvent } },
    options
  );
  if (!updatedOwner) {
    throw new KycReviewError("KYC_REVIEW_INVALID_TRANSITION", `Cannot transition KYC review status from '${owner.verificationStatus}' to '${targetStatus}'.`, 409);
  }
  try {
    const syncedUser = await syncReviewedOwnerUser({ userId: updatedOwner.user, targetStatus, User, session, logger });
    return { updatedOwner, syncedUser, defaultBrand };
  } catch (error) {
    logger.error("KYC review user sync failed for owner:", updatedOwner._id, error);
    throw new KycReviewError("KYC_REVIEW_USER_SYNC_FAILED", "Internal Server Error", 500);
  }
}

async function runKycReviewTransaction({ mongoose, customMongoose, work }) {
  const supportsSession = Boolean(
    (customMongoose && typeof customMongoose.startSession === "function") ||
    (mongoose?.connection?.readyState === 1 && typeof mongoose.startSession === "function")
  );
  if (!supportsSession) return work(null);
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => { result = await work(session); });
    return result;
  } finally {
    await session.endSession();
  }
}

module.exports = { executeKycReview, runKycReviewTransaction };
