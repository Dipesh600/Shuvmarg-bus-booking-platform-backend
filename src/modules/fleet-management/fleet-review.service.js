"use strict";

const { ApiError } = require("../../contracts");

const VALID_DOC_SLOTS = [
  "fitnessCert", "insurance", "bluebook", "routePermit", "fleetImages",
];

function createFleetReviewService({ repository, storage, mapper }) {
  async function resubmitFleet(fleetId, ownerId = null) {
    const fleet = await repository.findDocument(fleetId, ownerId);
    if (!fleet) throw new ApiError("FLEET_NOT_FOUND");
    if (fleet.approvalStatus !== "REJECTED") {
      throw new ApiError("FLEET_VALIDATION_FAILED");
    }
    const failed = Object.entries(fleet.documentReviews || {})
      .filter(([, value]) => value?.status === "rejected");
    if (failed.length > 0) {
      throw new ApiError("FLEET_VALIDATION_FAILED");
    }
    fleet.approvalStatus = "PENDING";
    fleet.status = "INACTIVE";
    fleet.rejectionReason = null;
    fleet.documentReviews = {
      fleetImages: { status: "pending", reason: null },
      fitnessCert: { status: "pending", reason: null },
      insurance: { status: "pending", reason: null },
      bluebook: { status: "pending", reason: null },
      routePermit: { status: "pending", reason: null },
    };
    await fleet.save();
    return fleet;
  }

  async function reuploadFleetDocument(
    fleetId,
    docSlot,
    file,
    ownerId = null
  ) {
    if (!VALID_DOC_SLOTS.includes(docSlot)) {
      throw new ApiError("FLEET_VALIDATION_FAILED");
    }
    const fleet = await repository.findDocument(fleetId, ownerId);
    if (!fleet) throw new ApiError("FLEET_NOT_FOUND");
    if (!["REJECTED", "APPROVED"].includes(fleet.approvalStatus)) {
      throw new ApiError("FLEET_VALIDATION_FAILED");
    }
    await storage.replaceDocument(fleet, docSlot, file);
    const status = fleet.approvalStatus === "REJECTED" ? "fixed" : "pending";
    if (!fleet.documentReviews) fleet.documentReviews = {};
    fleet.documentReviews[docSlot] = { status, reason: null };
    fleet.markModified("documentReviews");
    fleet.markModified("fleetDocuments");
    await fleet.save();
    return mapper.withPresignedUrls(fleet.toObject());
  }

  return { resubmitFleet, reuploadFleetDocument };
}

module.exports = { createFleetReviewService, VALID_DOC_SLOTS };
