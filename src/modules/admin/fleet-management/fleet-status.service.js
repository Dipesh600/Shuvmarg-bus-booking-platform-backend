"use strict";

const mongoose = require("mongoose");
const { resolveAuthorizedAdminActor } = require("../bus-owner-management/admin-actor.resolver");
const { buildFleetApprovalAuditEvent } = require("./fleet-approval-audit.builder");

const { validateFleetStatusRequest } = require("./fleet-status-request.policy");
const { FleetApprovalError } = require("./fleet-approval.errors");
const { DOCUMENT_REVIEW_KEYS, SECTION_REVIEW_KEYS, FLEET_REVIEW_KEYS, REVIEW_DECISIONS } = require("./fleet-review-requirements");

function createFleetApprovalService(deps = {}) {
  const repository = deps.repository;
  const resolveActor = deps.resolveAuthorizedAdminActor || resolveAuthorizedAdminActor;
  const buildAudit = deps.buildFleetApprovalAuditEvent || buildFleetApprovalAuditEvent;
  const validateRequest = deps.validateFleetStatusRequest || validateFleetStatusRequest;
  const notify = deps.notify || (async () => {});
  const clock = deps.clock || (() => new Date());
  const logger = deps.logger;
  const FleetRouteSetup = deps.FleetRouteSetup || null;

  async function decideFleetApproval(input = {}) {
    const { actor, ...body } = input;
    const validated = validateRequest(body);
    const { fleetId, decision, rejectionReason, reviews } = validated;

    const admin = await resolveActor(actor, deps);
    const decidedAt = clock();

    const auditEvent = buildAudit({
      decision,
      actorId: admin._id,
      occurredAt: decidedAt,
      rejectionReason,
    });

    const isApprove = decision === "APPROVED";
    if (isApprove && FleetRouteSetup) {
      const routeSetup = await FleetRouteSetup.findOne({ fleetId })
        .select("status resolutionStatus unresolvedPlaces").lean();
      if (!routeSetup || (
        !["READY", "APPROVED"].includes(routeSetup.status)
        || routeSetup.resolutionStatus !== "AVAILABLE"
        || (routeSetup.unresolvedPlaces || []).some((item) => item.reviewStatus !== "APPROVED")
      )) {
        throw new FleetApprovalError(
          "FLEET_ROUTE_REVIEW_INCOMPLETE",
          "Resolve the fleet route and added places before approving this fleet.",
          409
        );
      }
    }
    const update = {
      $set: {
        approvalStatus: decision,
        status: isApprove ? "ACTIVE" : "INACTIVE",
        approvedBy: isApprove ? admin._id : null,
        approvedAt: isApprove ? decidedAt : null,
        rejectedBy: isApprove ? null : admin._id,
        rejectedAt: isApprove ? null : decidedAt,
        rejectionReason: isApprove ? null : rejectionReason,
      },
      $push: {
        approvalAuditHistory: auditEvent,
      },
    };

    for (const key of DOCUMENT_REVIEW_KEYS) {
      update.$set[`documentReviews.${key}`] = {
        status: reviews[key].status.toLowerCase(),
        reason: reviews[key].reason,
        reviewedBy: admin._id,
        reviewedAt: decidedAt,
      };
    }
    for (const key of SECTION_REVIEW_KEYS) {
      update.$set[`sectionReviews.${key}`] = {
        status: reviews[key].status.toLowerCase(),
        reason: reviews[key].reason,
        reviewedBy: admin._id,
        reviewedAt: decidedAt,
      };
    }

    const updated = await repository.atomicDecidePendingFleet({ fleetId, update });

    if (!updated) {
      const current = await repository.findApprovalStatusById(fleetId);
      if (!current) {
        throw new FleetApprovalError("FLEET_NOT_FOUND", "Fleet not found.", 404);
      }
      throw new FleetApprovalError(
        "FLEET_APPROVAL_CONFLICT",
        current.approvalStatus === "PENDING"
          ? "Fleet approval decision could not be committed."
          : `Fleet approval was already decided as ${current.approvalStatus}.`,
        409
      );
    }

    try {
      await notify(updated, decision);
    } catch (notificationError) {
      if (logger && typeof logger.warn === "function") {
        logger.warn("Fleet approval notification failed:", notificationError);
      } else {
        console.warn("Fleet approval notification failed:", notificationError?.message || notificationError);
      }
    }

    const isoDate = decidedAt.toISOString();
    return {
      success: true,
      message: `Fleet ${decision.toLowerCase()} successfully.`,
      data: isApprove
        ? { fleetId: updated._id.toString(), approvalStatus: "APPROVED", status: "ACTIVE", approvedAt: isoDate }
        : { fleetId: updated._id.toString(), approvalStatus: "REJECTED", status: "INACTIVE", rejectedAt: isoDate, rejectionReason },
    };
  }

  async function saveFleetReviewItem({ fleetId, key, status, reason, actor }) {
    if (typeof fleetId !== "string" || !mongoose.Types.ObjectId.isValid(fleetId)
      || !FLEET_REVIEW_KEYS.includes(key) || !REVIEW_DECISIONS.includes(status)) {
      throw new FleetApprovalError("FLEET_REVIEW_INVALID", "Choose a valid fleet review section and decision.", 400);
    }
    const cleanReason = typeof reason === "string" ? reason.trim() : "";
    if (status === "REJECTED" && (cleanReason.length < 5 || cleanReason.length > 500)) {
      throw new FleetApprovalError("FLEET_REVIEW_REASON_REQUIRED", "A reason between 5 and 500 characters is required.", 400, "reason");
    }
    const admin = await resolveActor(actor, deps);
    const path = DOCUMENT_REVIEW_KEYS.includes(key) ? `documentReviews.${key}` : `sectionReviews.${key}`;
    const updated = await repository.savePendingReviewItem({
      fleetId,
      path,
      review: {
        status: status.toLowerCase(),
        reason: status === "REJECTED" ? cleanReason : null,
        reviewedBy: admin._id,
        reviewedAt: clock(),
      },
    });
    if (!updated) throw new FleetApprovalError("FLEET_APPROVAL_CONFLICT", "Only a pending fleet can be reviewed.", 409);
    return { success: true, data: { fleetId: String(updated._id), key, status, reason: status === "REJECTED" ? cleanReason : null } };
  }

  return { decideFleetApproval, saveFleetReviewItem };
}

module.exports = { createFleetApprovalService, createFleetStatusService: createFleetApprovalService };
