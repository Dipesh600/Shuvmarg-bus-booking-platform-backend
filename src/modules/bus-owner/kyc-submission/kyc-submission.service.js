"use strict";

const { ApiError } = require("../../../contracts");
const { validateKycDocuments } = require("./kyc-document.validator");
const { KYC_DOCUMENT_POLICY } = require("./kyc-document.policy");
const { validateOnboardingBody } = require("./bus-owner-onboarding.validator");
const { KycSubmissionStateError } = require("./kyc-submission.errors");
const { collectBusOwnerKycStorageReferences } = require("./kyc-document-references");
const { hasKycSubmissionEvidence } = require("./kyc-submission-state");
const { uploadOnboardingDocuments } = require("./kyc-submission-document-upload.service");
const { createKycMalwareScanner } = require("./kyc-malware-scanner.service");
const { applyKycSubmissionToOwner } = require("./kyc-submission-owner-update");
const { cleanupStoredDocuments } = require("./kyc-submission-cleanup");

function createKycSubmissionService({
  BusOwner,
  User,
  storageService,
  mongoose,
  clock = () => new Date(),
  logger = console,
  malwareScanner = createKycMalwareScanner({ clock, logger }),
}) {
  async function submitKyc({ userId, onboardingData, files }) {
    const normalized = validateOnboardingBody(onboardingData);

    const existingOwner = await BusOwner.findOne({ user: userId });
    const isInitialSubmission =
      !existingOwner || !hasKycSubmissionEvidence(existingOwner);
    const busOwner = existingOwner || new BusOwner({ user: userId });

    const rejectedDocumentFields = !isInitialSubmission && busOwner.verificationStatus === "rejected"
      ? Object.keys(KYC_DOCUMENT_POLICY).filter((field) => {
          if (field === "insuranceCertificates") {
            return Array.isArray(busOwner.insuranceCertificates) &&
              busOwner.insuranceCertificates.some((certificate) => Boolean(certificate?.rejectionReason));
          }
          const section = busOwner[field];
          const hasStoredFile = Array.isArray(section?.documentUrls) && section.documentUrls.length > 0;
          return Boolean(section?.rejectionReason) || (KYC_DOCUMENT_POLICY[field].required && !hasStoredFile);
        })
      : [];
    const resubmissionPolicy = Object.fromEntries(
      Object.entries(KYC_DOCUMENT_POLICY).map(([field, policy]) => [
        field,
        { ...policy, required: rejectedDocumentFields.includes(field) },
      ])
    );
    const providedFiles = files && typeof files === "object" ? files : {};
    const normalizedFiles = !isInitialSubmission && Object.keys(providedFiles).length === 0 && rejectedDocumentFields.length === 0
      ? {}
      : validateKycDocuments(
          providedFiles,
          isInitialSubmission ? KYC_DOCUMENT_POLICY : resubmissionPolicy
        );

    if (existingOwner && busOwner.verificationStatus === "approved") {
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
        ? collectBusOwnerKycStorageReferences(busOwner, Object.keys(normalizedFiles))
        : [];

    const newlyUploadedObjectKeys = [];
    const ownerId = busOwner._id ? busOwner._id.toString() : userId;

    try {
      const malwareScan = await malwareScanner.scanValidatedFiles(normalizedFiles);

      await uploadOnboardingDocuments({
        normalizedFiles,
        storageService,
        ownerId,
        busOwner,
        newlyUploadedObjectKeys,
      });

      applyKycSubmissionToOwner({
        busOwner, normalized, malwareScan, normalizedFiles, isInitialSubmission, userId, clock,
      });

      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          user.name = normalized.ownerName;
          await user.save({ session });
          await busOwner.save({ session });
        });
      } finally {
        await session.endSession();
      }

      await cleanupStoredDocuments({
        storageService, references: replacedDocumentReferences, logger,
        label: "KYC replaced-document cleanup",
      });

      return {
        success: true,
        message: "Bus owner onboarding submitted successfully",
        data: { verificationStatus: "pending" },
      };
    } catch (err) {
      await cleanupStoredDocuments({
        storageService, references: newlyUploadedObjectKeys, logger,
        label: "KYC S3 upload cleanup",
      });
      throw err;
    }
  }

  return { submitKyc };
}

module.exports = { createKycSubmissionService };
