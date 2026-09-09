"use strict";

const { getAdminActor } = require("../bus-owner-management/admin-actor.resolver");
const { createAdminFleetCreatedNotificationService } = require("./admin-fleet-created-notification.service");

const defaultService = createAdminFleetCreatedNotificationService();

async function notifyAdminCreatedFleet(req, res) {
  try {
    const result = await defaultService.notifyCreatedFleet({
      fleetId: req.params.fleetId,
      actor: getAdminActor(req),
    });
    return res.status(200).json({
      success: true,
      message: ["PROVIDER_ACCEPTED", "DELIVERED"].includes(result.status)
        ? "Fleet creation SMS accepted by the provider."
        : "Fleet was created, but its SMS has not been accepted yet.",
      notification: result,
    });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: status < 500 ? error.message : "Internal Server Error",
      ...(status < 500 && error.code ? { errorCode: error.code } : {}),
      ...(status === 422 && error.details ? { details: error.details } : {}),
    });
  }
}

module.exports = { notifyAdminCreatedFleet };
