"use strict";

const { createKycSubmissionService } = require("./kyc-submission.service");
const { handleKycSubmissionError } = require("./kyc-upload-error.mapper");
const { sanitizeKycDetailDescriptors } = require("../kyc-document-read/kyc-document-read.controller");
const { getEffectiveKycStatus } = require("./kyc-submission-state");

function unauthorized(res) {
  return res.status(401).json({
    success: false,
    message: "Unauthorized. Please login first.",
  });
}

function createKycSubmissionController({
  BusOwner,
  User,
  mongoose,
  storageService,
  kycDocumentReadService,
  kycSubmissionService = createKycSubmissionService({ BusOwner, User, mongoose, storageService }),
} = {}) {
  async function submitBusOwnerKyc(req, res) {
    try {
      const userId = req.userInfo?.id;
      if (!userId) return unauthorized(res);

      const result = await kycSubmissionService.submitKyc({
        userId,
        onboardingData: req.body,
        files: req.files,
      });

      return res.status(200).json(result);
    } catch (error) {
      return handleKycSubmissionError(error, res);
    }
  }

  async function getMyBusOwnerKycStatus(req, res) {
    try {
      const userId = req.userInfo?.id;
      if (!userId) return unauthorized(res);

      const owner = await BusOwner.findOne({ user: userId }).lean();
      if (!owner) {
        return res.status(404).json({
          success: false,
          message: "Bus owner KYC not found. Please submit your KYC.",
        });
      }

      // Status responses expose descriptors only. Do not presign or fetch any
      // document until the dedicated, scan-gated read endpoint is called.
      const sanitized = sanitizeKycDetailDescriptors(owner);
      sanitized.verificationStatus = getEffectiveKycStatus(owner);

      const fields = [
        "verificationStatus", "rejectionReason", "companyRegistration",
        "taxRegistration", "ownerIdentity",
        "createdAt", "updatedAt",
      ];
      return res.status(200).json({
        success: true,
        message: "Bus owner KYC status fetched successfully",
        data: Object.fromEntries(fields.map((field) => [field, sanitized[field]])),
      });
    } catch (error) {
      return handleKycSubmissionError(error, res);
    }
  }

  return { submitBusOwnerKyc, getMyBusOwnerKycStatus };
}

module.exports = { createKycSubmissionController };
