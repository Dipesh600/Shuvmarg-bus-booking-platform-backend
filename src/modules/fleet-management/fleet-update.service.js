"use strict";

const { ApiError } = require("../../contracts");

function createFleetUpdateService({
  Bus,
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
    if (!ownerId && typeof policy.rejectLifecycleUpdate === "function") {
      policy.rejectLifecycleUpdate(updateData);
    }
    if (ownerId) policy.restrictOwnerUpdate(updateData);
    policy.lockApprovedIdentity(fleet, updateData, ownerId);
    if (typeof policy.validateIdentityUpdate === "function") {
      policy.validateIdentityUpdate(updateData);
    }
    const images = await storage.replaceFleetImages(fleet, files);
    if (images) updateData.fleetImages = images;
    await policy.normalizeBusNumber(fleet, updateData);
    await policy.verifySeatLayout(fleet, updateData);
    policy.parseCatalogAndReviews(updateData, ownerId);
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
