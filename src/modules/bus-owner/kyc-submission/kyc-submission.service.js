"use strict";

const { validateKycDocuments } = require("./kyc-document.validator");
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
  storageService,
  clock = () => new Date(),
  logger = console,
}) {
  async function submitKyc({ userId, files }) {
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

    const replacedDocumentReferences =
      !isInitialSubmission && busOwner.verificationStatus === "rejected"
        ? collectBusOwnerKycStorageReferences(busOwner)
        : [];

    const normalizedFiles = validateKycDocuments(files);
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

      await busOwner.save();

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
        message: "Bus owner KYC submitted successfully",
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
