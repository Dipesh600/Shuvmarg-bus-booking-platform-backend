"use strict";

const { validateKycDocuments } = require("./kyc-document.validator");
const { validateOnboardingBody } = require("./bus-owner-onboarding.validator");
const { KycSubmissionStateError } = require("./kyc-submission.errors");
const { collectBusOwnerKycStorageReferences } = require("./kyc-document-references");
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
    // 1. Validate body before any I/O
    const normalized = validateOnboardingBody(onboardingData);

    // 2. Validate documents before any I/O
    const normalizedFiles = validateKycDocuments(files);

    // 3. Load owner record and enforce KYC state machine (before User load)
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

    // 4. Load user (only needed for approved/pending-free submissions)
    const user = User ? await User.findById(userId) : null;

    // 5. Snapshot old rejected document keys before touching anything
    const replacedDocumentReferences =
      !isInitialSubmission && busOwner.verificationStatus === "rejected"
        ? collectBusOwnerKycStorageReferences(busOwner)
        : [];

    // 6. Upload documents (outside transaction — S3 is not transactional)
    const newlyUploadedObjectKeys = [];
    const singleDocFields = ["companyRegistration", "taxRegistration", "transportLicense"];
    const ownerId = busOwner._id ? busOwner._id.toString() : userId;

    try {
      for (const field of singleDocFields) {
        if (normalizedFiles[field]) {
          const documentObjectKeys = [];
          for (const validatedFile of normalizedFiles[field]) {
            const key = await storageService.uploadDocument({
              validatedFile,
              ownerId,
              documentType: field,
            });
            newlyUploadedObjectKeys.push(key);
            documentObjectKeys.push(key);
          }
          busOwner[field] = busOwner[field] || {};
          busOwner[field].documentUrls = documentObjectKeys;
          busOwner[field].verified = false;
          busOwner[field].rejectionReason = null;
        }
      }

      if (normalizedFiles.insuranceCertificates) {
        const insuranceItems = [];
        for (const validatedFile of normalizedFiles.insuranceCertificates) {
          const key = await storageService.uploadDocument({
            validatedFile,
            ownerId,
            documentType: "insuranceCertificates",
          });
          newlyUploadedObjectKeys.push(key);
          insuranceItems.push({
            insurerName: null,
            policyNumber: null,
            validTill: null,
            documentUrls: [key],
            verified: false,
            rejectionReason: null,
          });
        }
        busOwner.insuranceCertificates = insuranceItems;
      }

      // 7. Apply normalized profile data to both records before transaction
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

      // 8. Persist both records inside a transaction
      if (mongoose && typeof mongoose.startSession === "function" && user) {
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
          if (user) {
            user.name = normalized.ownerName;
            user.address = normalized.address;
            await user.save({ session });
          }
          await busOwner.save({ session });
          await session.commitTransaction();
        } catch (txErr) {
          await session.abortTransaction();
          throw txErr;
        } finally {
          session.endSession();
        }
      } else {
        // Fallback for test environments without real mongoose sessions
        if (user) {
          user.name = normalized.ownerName;
          user.address = normalized.address;
          await user.save();
        }
        await busOwner.save();
      }

      // 9. Clean old rejected objects only after successful commit
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
      // Roll back newly uploaded S3 objects on any failure
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
