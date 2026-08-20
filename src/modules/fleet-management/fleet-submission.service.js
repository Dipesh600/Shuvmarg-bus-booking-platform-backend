"use strict";
const BusModel = require("../../../models/fleetModel");
const BusOwnerModel = require("../../../models/busOwnerModel");
const FleetSeatLayoutAssignmentModel = require("../../../models/fleetSeatLayoutAssignmentModel");
const SeatLayoutRevisionModel = require("../../../models/seatLayoutRevisionModel");
const { ApiError } = require("../../contracts");
const { FLEET_APPROVAL_STATUS } = require("../../contracts/status/fleet-approval.status");
const { evaluateFleetSubmissionReadiness } = require("./fleet-readiness.evaluator");
function createFleetSubmissionService(deps = {}) {
  const Bus = deps.Bus || BusModel;
  const BusOwner = deps.BusOwner || BusOwnerModel;
  const FleetSeatLayoutAssignment = deps.FleetSeatLayoutAssignment || FleetSeatLayoutAssignmentModel;
  const SeatLayoutRevision = deps.SeatLayoutRevision || SeatLayoutRevisionModel;
  const FleetRouteSetup = deps.FleetRouteSetup || null;
  const readinessEvaluator = deps.readinessEvaluator || evaluateFleetSubmissionReadiness;
  const loadSeatLayout = deps.loadSeatLayout || (async (fleetId) => {
    const assignment = await FleetSeatLayoutAssignment.findOne({ fleetId })
      .select("activeRevisionId")
      .lean();
    const revision = assignment
      ? await SeatLayoutRevision.findById(assignment.activeRevisionId)
        .select("status totalPlaces")
        .lean()
      : null;
    return {
      assigned: Boolean(assignment),
      published: revision?.status === "PUBLISHED",
      totalPlaces: revision?.totalPlaces,
    };
  });
  async function submitFleetForVerification({ fleetId, ownerId }) {
    if (!fleetId) {
      throw new ApiError("FLEET_INVALID_ID", "Fleet ID is required.");
    }
    if (!ownerId) {
      throw new ApiError("UNAUTHORIZED", "Owner ID is required.");
    }
    const busOwner = await BusOwner.findOne({ user: ownerId })
      .select("verificationStatus")
      .lean();
    if (!busOwner || busOwner.verificationStatus !== "approved") {
      throw new ApiError(
        "PROFILE_NOT_APPROVED",
        "Business verification is required before you can submit fleets for approval.",
        403
      );
    }
    let fleetQuery = Bus.findOne({ _id: fleetId, ownerId });
    if (typeof fleetQuery.schemaLevelProjections === "function") {
      fleetQuery = fleetQuery.schemaLevelProjections(false);
    }
    const fleet = await fleetQuery.lean();
    if (!fleet) {
      throw new ApiError("FLEET_NOT_FOUND", "Fleet not found or unauthorized.", 404);
    }
    if (
      fleet.approvalStatus === FLEET_APPROVAL_STATUS.PENDING ||
      fleet.approvalStatus === FLEET_APPROVAL_STATUS.APPROVED
    ) {
      throw new ApiError(
        "FLEET_SUBMISSION_LOCKED",
        `Fleet is currently ${fleet.approvalStatus.toLowerCase()} and cannot be submitted.`,
        409
      );
    }
    const seatLayout = await loadSeatLayout(fleetId);
    const routeSetup = FleetRouteSetup
      ? await FleetRouteSetup.findOne({ fleetId, ownerId })
        .select("status resolutionStatus unresolvedPlaces").lean()
      : null;
    if (FleetRouteSetup && !routeSetup) {
      throw new ApiError("FLEET_SUBMISSION_INCOMPLETE",
        "Choose this bus's journey and route before submitting.", 422,
        { routeSetup: { complete: false } });
    }
    const readiness = readinessEvaluator(fleet, {
      seatLayout,
    });
    if (!readiness.complete) {
      throw new ApiError(
        "FLEET_SUBMISSION_INCOMPLETE",
        "Fleet setup or compliance documents are incomplete.",
        422,
        readiness
      );
    }
    const now = new Date();
    const updated = await Bus.findOneAndUpdate(
      {
        _id: fleetId,
        ownerId,
        approvalStatus: {
          $in: [FLEET_APPROVAL_STATUS.DRAFT, FLEET_APPROVAL_STATUS.REJECTED],
        },
      },
      {
        $set: {
          approvalStatus: FLEET_APPROVAL_STATUS.PENDING,
          status: "INACTIVE",
          setupComplete: false,
          submittedAt: now,
          rejectionReason: null,
          rejectedAt: null,
          rejectedBy: null,
          isApproved: false,
          approvedAt: null,
          approvedBy: null,
          "documentReviews.fleetImages.status": "pending",
          "documentReviews.fitnessCert.status": "pending",
          "documentReviews.insurance.status": "pending",
          "documentReviews.bluebook.status": "pending",
          "documentReviews.routePermit.status": "pending",
        },
        $inc: {
          __v: 1,
        },
        $push: {
          approvalAuditHistory: {
            eventType: fleet.approvalStatus === FLEET_APPROVAL_STATUS.REJECTED
              ? "FLEET_RESUBMITTED"
              : "FLEET_SUBMITTED",
            actorType: "BUS_OWNER",
            actorId: ownerId,
            fromStatus: fleet.approvalStatus,
            toStatus: FLEET_APPROVAL_STATUS.PENDING,
            occurredAt: now,
          },
        },
      },
      { new: true, runValidators: true }
    ).lean();
    if (!updated) {
      throw new ApiError(
        "FLEET_SUBMISSION_LOCKED",
        "Fleet submission failed or status changed concurrently.",
        409
      );
    }
    if (FleetRouteSetup && routeSetup) {
      await FleetRouteSetup.updateOne(
        { fleetId, ownerId },
        { $set: { status: routeSetup.status === "READY" ? "READY" : "PENDING_REVIEW" } }
      );
    }
    return updated;
  }
  return { submitFleetForVerification };
}
module.exports = { createFleetSubmissionService };
