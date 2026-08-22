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
      message: result.status === "DELIVERED"
        ? "Fleet creation SMS delivered."
        : "Fleet was created, but its SMS was not delivered.",
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
