"use strict";

const { ApiError } = require("../../contracts");
const { hasGranularReviewDecision } = require("./fleet-review-state");

function createFleetUpdateService({
  Bus,
  BusAmenities,
  repository,
  policy,
  storage,
  mapper,
}) {
  async function updateFleetDetails(
    fleetId,
    updateData,
    files,
    ownerId = null
  ) {
    const fleet = await repository.findDocument(fleetId, ownerId);
    if (!fleet) throw new ApiError("FLEET_NOT_FOUND", "Fleet not found or unauthorized.");
    if (ownerId && (fleet.approvalStatus === "PENDING" || fleet.approvalStatus === "APPROVED")) {
      throw new ApiError(
        "FLEET_MUTATION_LOCKED",
        `Fleet is currently ${fleet.approvalStatus.toLowerCase()} and cannot be edited.`,
        409
      );
    }
    const correctingRejectedFleet = ownerId && fleet.approvalStatus === "REJECTED";
    const granularCorrection = correctingRejectedFleet && hasGranularReviewDecision(fleet);
    const correctingVehicleDetails = correctingRejectedFleet && (
      !granularCorrection || fleet.sectionReviews?.vehicleDetails?.status === "rejected"
    );
    if (granularCorrection && !correctingVehicleDetails) {
      throw new ApiError("FLEET_SECTION_NOT_REJECTED");
    }
    if (!ownerId && typeof policy.rejectLifecycleUpdate === "function") {
      policy.rejectLifecycleUpdate(updateData);
    }
    if (ownerId) policy.restrictOwnerUpdate(updateData);
    if (correctingVehicleDetails) {
      updateData["sectionReviews.vehicleDetails"] = {
        status: "not_submitted", reason: null, reviewedBy: null, reviewedAt: null,
      };
    }
    policy.lockApprovedIdentity(fleet, updateData, ownerId);
    if (typeof policy.validateIdentityUpdate === "function") {
      policy.validateIdentityUpdate(updateData);
    }
    const images = await storage.replaceFleetImages(fleet, files);
    if (images) updateData.fleetImages = images;
    await policy.normalizeBusNumber(fleet, updateData);
    await policy.verifySeatLayout(fleet, updateData);
    policy.parseCatalogAndReviews(updateData, ownerId);
    if (Array.isArray(updateData.amenityIds) && updateData.amenityIds.length > 0) {
      const effectiveOwnerId = ownerId || fleet.ownerId;
      const count = await BusAmenities.countDocuments({
        _id: { $in: updateData.amenityIds },
        status: true,
        $or: [{ type: "GLOBAL" }, { type: "CUSTOM", ownerId: effectiveOwnerId }],
      });
      if (count !== updateData.amenityIds.length) {
        throw new ApiError("FLEET_VALIDATION_FAILED", "One or more amenities are unavailable for this operator.", 400);
      }
    }
    const updatedFleet = await Bus.findByIdAndUpdate(
      fleetId,
      { ...updateData },
      { new: true, runValidators: true }
    ).lean();
    return mapper.withPresignedUrls(updatedFleet);
  }

  return { updateFleetDetails };
}

module.exports = { createFleetUpdateService };
