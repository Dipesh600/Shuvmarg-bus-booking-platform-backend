"use strict";

const Bus = require("../../../../models/fleetModel");
const FleetSeatLayoutAssignment = require("../../../../models/fleetSeatLayoutAssignmentModel");
const SeatLayoutRevision = require("../../../../models/seatLayoutRevisionModel");
const { createSeatLayoutLoader } = require("../../fleet-management/fleet-submission-seat-layout.loader");
const { evaluateFleetSubmissionReadiness } = require("../../fleet-management/fleet-readiness.evaluator");
const { resolveAuthorizedAdminActor } = require("../bus-owner-management/admin-actor.resolver");
const { resolveOperatorLoginUrl } = require("../bus-owner-management/operator-portal.config");
const { busOwnerNotificationService } = require("../../notifications/bus-owner");

function notificationError(message, statusCode, code, details) {
  return Object.assign(new Error(message), { statusCode, code, details });
}

function createAdminFleetCreatedNotificationService(deps = {}) {
  const BusModel = deps.Bus || Bus;
  const resolveActor = deps.resolveAuthorizedAdminActor || resolveAuthorizedAdminActor;
  const loadSeatLayout = deps.loadSeatLayout
    || createSeatLayoutLoader(
      deps.FleetSeatLayoutAssignment || FleetSeatLayoutAssignment,
      deps.SeatLayoutRevision || SeatLayoutRevision
    );
  const notify = deps.notify
    || busOwnerNotificationService.notifyAdminCreatedFleet;
  const clock = deps.clock || (() => new Date());

  async function notifyCreatedFleet({ fleetId, actor }) {
    const admin = await resolveActor(actor, deps);
    const fleet = await BusModel.findById(fleetId).populate("ownerId", "name phone email");
    if (!fleet) throw notificationError("Fleet not found.", 404, "FLEET_NOT_FOUND");
    if (fleet.createdBy !== "ADMIN") {
      throw notificationError("Only an admin-created fleet uses this notification.", 409, "FLEET_NOT_ADMIN_CREATED");
    }
    if (["PROVIDER_ACCEPTED", "DELIVERED"].includes(fleet.adminCreationNotification?.status)) {
      return { status: fleet.adminCreationNotification.status, alreadyAccepted: true };
    }
    const readiness = evaluateFleetSubmissionReadiness(fleet, {
      seatLayout: await loadSeatLayout(fleetId),
    });
    if (!readiness.complete) {
      throw notificationError(
        "Finish the fleet documents, photos and published seat layout before notifying the owner.",
        422,
        "ADMIN_FLEET_CREATION_INCOMPLETE",
        readiness
      );
    }
    let loginUrl;
    try {
      loginUrl = resolveOperatorLoginUrl(deps.env);
    } catch (error) {
      throw notificationError(error.message, 503, "OPERATOR_PORTAL_NOT_CONFIGURED");
    }
    const now = clock();
    const claimed = await BusModel.findOneAndUpdate({
      _id: fleetId,
      $or: [
        { "adminCreationNotification.status": { $nin: ["PROCESSING", "PROVIDER_ACCEPTED", "DELIVERED"] } },
        {
          "adminCreationNotification.status": "PROCESSING",
          "adminCreationNotification.lastAttemptAt": { $lt: new Date(now.getTime() - 5 * 60 * 1000) },
        },
      ],
    }, {
      $set: {
        "adminCreationNotification.status": "PROCESSING",
        "adminCreationNotification.lastAttemptAt": now,
        "adminCreationNotification.initiatedBy": admin._id,
      },
      $inc: { "adminCreationNotification.attempts": 1 },
    }, { new: true });
    if (!claimed) {
      return { status: "PROCESSING", alreadyAccepted: false };
    }
    let delivery;
    try {
      delivery = await notify(fleet, loginUrl);
    } catch (error) {
      (deps.logger || console).warn("[Admin Fleet Notification] delivery failed:", error.message);
      delivery = { smsDelivered: false };
    }
    const status = (delivery?.smsAccepted || delivery?.smsDelivered) ? "PROVIDER_ACCEPTED"
      : ["PENDING", "RETRY_SCHEDULED", "PROCESSING"].includes(delivery?.smsStatus) ? "PENDING" : "FAILED";
    await BusModel.updateOne({ _id: fleetId }, {
      $set: {
        "adminCreationNotification.status": status,
        "adminCreationNotification.deliveredAt": null,
      },
    });
    return { status, alreadyAccepted: false };
  }
  return { notifyCreatedFleet };
}

module.exports = { createAdminFleetCreatedNotificationService };
