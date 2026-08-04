"use strict";

const { validateKycDocuments } = require("./kyc-document.validator");
const { KYC_DOCUMENT_POLICY } = require("./kyc-document.policy");
const { KycSubmissionStateError } = require("./kyc-submission.errors");

function createKycSubmissionService({ BusOwner, uploadService }) {
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

    const uploadedPublicIds = [];
    const singleDocFields = ["companyRegistration", "taxRegistration", "transportLicense"];

    try {
      for (const field of singleDocFields) {
        if (normalizedFiles[field]) {
          const folder = KYC_DOCUMENT_POLICY[field].folder;
          const assets = await uploadService.uploadMany(normalizedFiles[field], folder);
          for (const asset of assets) {
            if (asset && asset.publicId) uploadedPublicIds.push(asset.publicId);
          }
          const urls = assets.map((a) => (typeof a === "string" ? a : a.url));

          busOwner[field] = busOwner[field] || {};
          busOwner[field].documentUrls = urls;
          busOwner[field].verified = false;
          busOwner[field].rejectionReason = null;
        }
      }

      if (normalizedFiles.insuranceCertificates) {
        const folder = KYC_DOCUMENT_POLICY.insuranceCertificates.folder;
        const assets = await uploadService.uploadMany(
          normalizedFiles.insuranceCertificates,
          folder
        );
        for (const asset of assets) {
          if (asset && asset.publicId) uploadedPublicIds.push(asset.publicId);
        }

        busOwner.insuranceCertificates = assets.map((asset) => {
          const url = typeof asset === "string" ? asset : asset.url;
          return {
            insurerName: null,
            policyNumber: null,
            validTill: null,
            documentUrls: [url],
            verified: false,
            rejectionReason: null,
          };
        });
      }

      busOwner.verificationStatus = "pending";
      busOwner.rejectionReason = null;

      await busOwner.save();

      return {
        success: true,
        message: "Bus owner KYC submitted successfully",
      };
    } catch (err) {
      if (uploadedPublicIds.length > 0 && typeof uploadService.deleteMany === "function") {
        try {
          await uploadService.deleteMany(uploadedPublicIds);
        } catch (cleanupErr) {
          console.error("KYC upload cleanup error:", cleanupErr);
        }
      }
      throw err;
    }
  }

  return { submitKyc };
}

module.exports = { createKycSubmissionService };
