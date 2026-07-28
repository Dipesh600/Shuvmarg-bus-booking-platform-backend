"use strict";

const VALID_DOC_SLOTS = [
  "fitnessCert", "insurance", "bluebook", "routePermit", "fleetImages",
];

function createFleetReviewService({ repository, storage, mapper }) {
  async function resubmitFleet(fleetId, ownerId = null) {
    const fleet = await repository.findDocument(fleetId, ownerId);
    if (!fleet) throw new Error("Fleet not found or unauthorized.");
    if (fleet.approvalStatus !== "REJECTED") {
      throw new Error(
        `Only REJECTED fleets can be resubmitted. Current status: ` +
        `${fleet.approvalStatus}.`
      );
    }
    const failed = Object.entries(fleet.documentReviews || {})
      .filter(([, value]) => value?.status === "rejected");
    if (failed.length > 0) {
      throw new Error(
        "Please re-upload the following failed documents before resubmitting: " +
        `${failed.map(([name]) => name).join(", ")}.`
      );
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
      throw new Error(
        `Invalid document slot: ${docSlot}. Must be one of: ` +
        `${VALID_DOC_SLOTS.join(", ")}.`
      );
    }
    const fleet = await repository.findDocument(fleetId, ownerId);
    if (!fleet) throw new Error("Fleet not found or unauthorized.");
    if (!["REJECTED", "APPROVED"].includes(fleet.approvalStatus)) {
      throw new Error(
        "Documents can only be replaced on REJECTED or APPROVED fleets."
      );
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
