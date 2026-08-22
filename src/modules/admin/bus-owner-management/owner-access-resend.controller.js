"use strict";

const { getAdminActor } = require("./admin-actor.resolver");
const { mapAdminKycError } = require("./admin-kyc-error.mapper");
const { createOwnerAccessResendService } = require("./owner-access-resend.service");

const defaultService = createOwnerAccessResendService();

async function resendOwnerAccess(req, res, deps = {}) {
  try {
    const result = await (deps.service || defaultService).resendOwnerAccess({
      userId: req.params.userId,
      actor: getAdminActor(req),
    });
    return res.status(200).json({
      success: true,
      message: result.notification?.status === "DELIVERED"
        ? "Operator access message sent."
        : "Operator access message could not be delivered.",
      ...result,
    });
  } catch (error) {
    const { statusCode, payload } = mapAdminKycError(error);
    return res.status(statusCode).json(payload);
  }
}

module.exports = { resendOwnerAccess };
