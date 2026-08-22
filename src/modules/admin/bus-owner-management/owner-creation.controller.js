"use strict";

const { createAdminOwnerCreationService } = require("./admin-owner-creation.service");
const { getAdminActor } = require("./admin-actor.resolver");
const { mapAdminKycError } = require("./admin-kyc-error.mapper");

const defaultCreationService = createAdminOwnerCreationService();

const createBusOwnerFull = async (req, res, deps = {}) => {
  const service = deps.service || defaultCreationService;
  try {
    const actor = getAdminActor(req);
    const result = await service.createAdminBusOwner({
      body: req.body,
      files: req.files || {},
      actor,
    });
    return res.status(201).json({
      success: true,
      message: "Bus Owner registered successfully with PENDING KYC status.",
      busOwnerId: result.busOwnerId,
      userId: result.userId,
      credentialMode: result.credentialMode,
      notification: result.notification,
    });
  } catch (error) {
    const { statusCode, payload } = mapAdminKycError(error);
    return res.status(statusCode).json(payload);
  }
};

module.exports = { createBusOwnerFull };
