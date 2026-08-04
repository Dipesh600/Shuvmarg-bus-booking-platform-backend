"use strict";

const { validateKycDocuments } = require("./kyc-document.validator");
const { KycSubmissionStateError } = require("./kyc-submission.errors");

function createKycSubmissionService({ BusOwner, storageService }) {
  async function submitKyc({ userId, files }) {
    let busOwner = await BusOwner.findOne({ user: userId });
    if (!busOwner) {
      busOwner = new BusOwner({ user: userId });
    }

    if (busOwner.verificationStatus === "approved") {
      throw new KycSubmissionStateError(
        "KYC_SUBMISSION_STATE_CONFLICT",
        "Approved KYC application cannot be overwritten or resubmitted.",
        409
      );
    }
    if (busOwner.verificationStatus === "pending") {
      throw new KycSubmissionStateError(
        "KYC_SUBMISSION_STATE_CONFLICT",
        "KYC application is currently under review. Duplicate submissions are not allowed.",
        409
      );
    }

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

      await busOwner.save();

      return {
        success: true,
        message: "Bus owner KYC submitted successfully",
      };
    } catch (err) {
      if (newlyUploadedObjectKeys.length > 0 && typeof storageService.deleteMany === "function") {
        try {
          const cleanupResult = await storageService.deleteMany(newlyUploadedObjectKeys);
          if (cleanupResult && cleanupResult.failed && cleanupResult.failed.length > 0) {
            console.error("KYC S3 upload cleanup failures:", cleanupResult.failed);
          }
        } catch (cleanupErr) {
          console.error("KYC S3 upload cleanup unexpected error:", cleanupErr);
        }
      }
      throw err;
    }
  }

  return { submitKyc };
}

module.exports = { createKycSubmissionService };
