"use strict";

const { createKycSubmissionService } = require("./kyc-submission.service");
const { handleKycSubmissionError } = require("./kyc-upload-error.mapper");

function unauthorized(res) {
  return res.status(401).json({
    success: false,
    message: "Unauthorized. Please login first.",
  });
}

function createKycSubmissionController({
  BusOwner,
  storageService,
  kycDocumentReadService,
  kycSubmissionService = createKycSubmissionService({ BusOwner, storageService }),
}) {
  async function submitBusOwnerKyc(req, res) {
    try {
      const userId = req.userInfo?.id;
      if (!userId) return unauthorized(res);

      const result = await kycSubmissionService.submitKyc({
        userId,
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

      const resolvedOwner = kycDocumentReadService
        ? await kycDocumentReadService.resolveOwnerKycDocuments(owner)
        : owner;

      const fields = [
        "verificationStatus", "rejectionReason", "companyRegistration",
        "taxRegistration", "transportLicense", "insuranceCertificates",
        "createdAt", "updatedAt",
      ];
      return res.status(200).json({
        success: true,
        message: "Bus owner KYC status fetched successfully",
        data: Object.fromEntries(fields.map((field) => [field, resolvedOwner[field]])),
      });
    } catch (error) {
      return handleKycSubmissionError(error, res);
    }
  }

  return { submitBusOwnerKyc, getMyBusOwnerKycStatus };
}

module.exports = { createKycSubmissionController };
