"use strict";

const { ApiError } = require("../../../contracts");
const { validateKycDocuments } = require("./kyc-document.validator");
const { validateOnboardingBody } = require("./bus-owner-onboarding.validator");
const { KycSubmissionStateError } = require("./kyc-submission.errors");
const { collectBusOwnerKycStorageReferences } = require("./kyc-document-references");
const { uploadOnboardingDocuments } = require("./kyc-submission-document-upload.service");
const {
  buildKycAuditEvent,
  countValidatedKycFiles,
  KYC_AUDIT_EVENT,
  KYC_AUDIT_ACTOR,
} = require("../kyc-audit");

function createKycSubmissionService({
  BusOwner,
  User,
  storageService,
  mongoose,
  clock = () => new Date(),
  logger = console,
}) {
  async function submitKyc({ userId, onboardingData, files }) {
    const normalized = validateOnboardingBody(onboardingData);
    const normalizedFiles = validateKycDocuments(files);

    const existingOwner = await BusOwner.findOne({ user: userId });
    const isInitialSubmission = !existingOwner;
    const busOwner = existingOwner || new BusOwner({ user: userId });

    if (!isInitialSubmission && busOwner.verificationStatus === "approved") {
      throw new KycSubmissionStateError(
        "KYC_SUBMISSION_STATE_CONFLICT",
        "Approved KYC application cannot be overwritten or resubmitted.",
        409
      );
    }
    if (!isInitialSubmission && busOwner.verificationStatus === "pending") {
      throw new KycSubmissionStateError(
        "KYC_SUBMISSION_STATE_CONFLICT",
        "KYC application is currently under review. Duplicate submissions are not allowed.",
        409
      );
    }

    const user = User && typeof User.findById === "function" ? await User.findById(userId) : null;
    if (!user) {
      throw new ApiError("BUS_OWNER_ONBOARDING_USER_NOT_FOUND");
    }

    if (!mongoose || typeof mongoose.startSession !== "function") {
      throw new ApiError("BUS_OWNER_ONBOARDING_TRANSACTION_UNAVAILABLE");
    }

    const replacedDocumentReferences =
      !isInitialSubmission && busOwner.verificationStatus === "rejected"
        ? collectBusOwnerKycStorageReferences(busOwner)
        : [];

    const newlyUploadedObjectKeys = [];
    const ownerId = busOwner._id ? busOwner._id.toString() : userId;

    try {
      await uploadOnboardingDocuments({
        normalizedFiles,
        storageService,
        ownerId,
        busOwner,
        newlyUploadedObjectKeys,
      });

      busOwner.companyName = normalized.companyName;
      busOwner.taxRegistration = busOwner.taxRegistration || {};
      busOwner.taxRegistration.panNumber = normalized.panNumber;
      busOwner.taxRegistration.registrationNumber = normalized.registrationNumber;
      busOwner.bankDetails = busOwner.bankDetails || {};
      busOwner.bankDetails.bankName = normalized.bankName;
      busOwner.bankDetails.accountHolderName = normalized.accountHolderName;
      busOwner.bankDetails.accountNumber = normalized.accountNumber;
      busOwner.bankDetails.branchName = normalized.branchName;
      busOwner.bankDetails.swiftCode = normalized.swiftCode;

      busOwner.verificationStatus = "pending";
      busOwner.rejectionReason = null;
      busOwner.kycReview = { reviewedBy: null, reviewedAt: null };

      if (!Array.isArray(busOwner.kycAuditHistory)) {
        busOwner.kycAuditHistory = [];
      }
      const documentCount = countValidatedKycFiles(normalizedFiles);
      const auditEvent = buildKycAuditEvent({
        eventType: isInitialSubmission ? KYC_AUDIT_EVENT.SUBMITTED : KYC_AUDIT_EVENT.RESUBMITTED,
        actorType: KYC_AUDIT_ACTOR.BUS_OWNER,
        actorId: userId,
        fromStatus: isInitialSubmission ? null : "rejected",
        toStatus: "pending",
        occurredAt: clock(),
        metadata: { documentCount },
      });
      busOwner.kycAuditHistory.push(auditEvent);

      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          user.name = normalized.ownerName;
          user.address = normalized.address;
          await user.save({ session });
          await busOwner.save({ session });
        });
      } finally {
        await session.endSession();
      }

      if (replacedDocumentReferences.length > 0 && typeof storageService.deleteMany === "function") {
        try {
          const oldCleanupResult = await storageService.deleteMany(replacedDocumentReferences);
          if (oldCleanupResult && oldCleanupResult.failed && oldCleanupResult.failed.length > 0) {
            logger.error("KYC replaced-document cleanup failures:", oldCleanupResult.failed);
          }
        } catch (cleanupErr) {
          logger.error("KYC replaced-document cleanup unexpected error:", cleanupErr);
        }
      }

      return {
        success: true,
        message: "Bus owner onboarding submitted successfully",
        data: { verificationStatus: "pending" },
      };
    } catch (err) {
      if (newlyUploadedObjectKeys.length > 0 && typeof storageService.deleteMany === "function") {
        try {
          const cleanupResult = await storageService.deleteMany(newlyUploadedObjectKeys);
          if (cleanupResult && cleanupResult.failed && cleanupResult.failed.length > 0) {
            logger.error("KYC S3 upload cleanup failures:", cleanupResult.failed);
          }
        } catch (cleanupErr) {
          logger.error("KYC S3 upload cleanup unexpected error:", cleanupErr);
        }
      }
      throw err;
    }
  }

  return { submitKyc };
}

module.exports = { createKycSubmissionService };
