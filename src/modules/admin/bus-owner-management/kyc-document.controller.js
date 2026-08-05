"use strict";

const { createAdminKycReuploadService } = require("./admin-kyc-reupload.service");
const { getAdminActor } = require("./admin-actor.resolver");
const { mapAdminKycError } = require("./admin-kyc-error.mapper");

const defaultReuploadService = createAdminKycReuploadService();

const reuploadKycDocument = async (req, res, deps = {}) => {
  const service = deps.service || defaultReuploadService;
  try {
    const actor = getAdminActor(req);
    const { id, documentType } = req.body || {};
    const file = (req.files || {}).document || (req.files || {})[documentType];

    const result = await service.reuploadRejectedKycDocument({
      ownerId: id,
      documentType,
      file,
      actor,
    });

    return res.status(200).json({
      success: true,
      message: "KYC document re-uploaded successfully and returned to pending review.",
      data: {
        busOwnerId: result.busOwnerId,
        verificationStatus: result.verificationStatus,
        documentType: result.documentType,
      },
    });
  } catch (error) {
    const { statusCode, payload } = mapAdminKycError(error);
    return res.status(statusCode).json(payload);
  }
};

module.exports = { reuploadKycDocument };
