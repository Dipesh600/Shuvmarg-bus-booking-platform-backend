"use strict";

const BusOwner = require("../../../../models/busOwnerModel.js");
const {
  uploadFileToS3,
  buildS3Path,
} = require("../../../../services/s3Service.js");
const {
  VALID_KYC_DOCUMENT_TYPES,
} = require("./request-validation.policy.js");

const reuploadKycDocument = async (req, res) => {
  try {
    const { id, documentType } = req.body;
    if (!id || !documentType) {
      return res.status(400).json({
        success: false,
        message: "Bus Owner ID and Document Type are required.",
      });
    }
    if (!VALID_KYC_DOCUMENT_TYPES.includes(documentType)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid document type." });
    }
    const document = (req.files || {}).document;
    if (!document) {
      return res.status(400).json({
        success: false,
        message: "No document file provided for re-upload.",
      });
    }
    const owner = await BusOwner.findById(id);
    if (!owner) {
      return res.status(404).json({
        success: false,
        message: "Bus owner KYC record not found.",
      });
    }
    const documentUrl = await uploadFileToS3(
      document,
      buildS3Path({
        type: "owner_kyc",
        ownerId: owner._id.toString(),
        documentType,
      })
    );
    if (!documentUrl) {
      return res.status(500).json({
        success: false,
        message: "Failed to upload document to storage.",
      });
    }
    if (!owner[documentType]) owner[documentType] = {};
    owner[documentType].documentUrls = [documentUrl];
    owner[documentType].verified = false;
    owner[documentType].rejectionReason = null;
    owner.verificationStatus = "pending";
    await owner.save();
    return res.status(200).json({
      success: true,
      message:
        `${documentType} re-uploaded successfully. ` +
        "KYC status is now pending review.",
      data: owner,
    });
  } catch (error) {
    console.error("reuploadKycDocument error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

module.exports = { reuploadKycDocument };
