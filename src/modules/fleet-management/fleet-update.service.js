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
  validateBrand,
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
    if (!ownerId && fleet.approvalStatus === "PENDING") {
      throw new ApiError(
        "FLEET_MUTATION_LOCKED",
        "Fleet is currently under review and cannot be edited through the generic admin update endpoint.",
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
    else if (typeof policy.restrictAdminUpdate === "function") policy.restrictAdminUpdate(updateData);
    if (correctingVehicleDetails) {
      updateData["sectionReviews.vehicleDetails"] = {
        status: "not_submitted", reason: null, reviewedBy: null, reviewedAt: null,
      };
    }
    policy.lockApprovedIdentity(fleet, updateData, ownerId);
    if (typeof policy.validateIdentityUpdate === "function") {
      policy.validateIdentityUpdate(updateData);
    }
    if (updateData.brandId && typeof validateBrand === "function") {
      await validateBrand(updateData.brandId, fleet.ownerId);
    }
    const images = await storage.replaceFleetImages(fleet, files);
    if (images) updateData.fleetImages = images;
    await policy.normalizeBusNumber(fleet, updateData);
    await policy.verifySeatLayout(fleet, updateData);
    policy.parseCatalogAndReviews(updateData, ownerId);
    if (Array.isArray(updateData.amenityIds)) {
      const requestedIds = updateData.amenityIds.map(String);
      if (requestedIds.some((id) => !/^[0-9a-fA-F]{24}$/.test(id)) || new Set(requestedIds).size !== requestedIds.length) {
        throw new ApiError("FLEET_VALIDATION_FAILED", "Amenities must contain unique valid IDs.", 400);
      }
      const currentIds = new Set((fleet.amenityIds || []).map((item) => String(item?._id || item)));
      const addedIds = requestedIds.filter((id) => !currentIds.has(id));
      const effectiveOwnerId = ownerId || fleet.ownerId;
      const count = await BusAmenities.countDocuments({
        _id: { $in: addedIds },
        status: true,
        $or: [{ type: "GLOBAL" }, { type: "CUSTOM", ownerId: effectiveOwnerId }],
      });
      if (count !== addedIds.length) {
        throw new ApiError("FLEET_VALIDATION_FAILED", "One or more amenities are unavailable for this operator.", 400);
      }
      updateData.amenityIds = requestedIds;
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
