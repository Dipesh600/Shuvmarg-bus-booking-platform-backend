"use strict";

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
    if (!fleet) throw new Error("Fleet not found or unauthorized.");
    if (ownerId) policy.restrictOwnerUpdate(updateData);
    policy.lockApprovedIdentity(fleet, updateData);
    const images = await storage.replaceFleetImages(fleet, files);
    if (images) updateData.fleetImages = images;
    await policy.normalizeBusNumber(fleet, updateData);
    await policy.verifySeatLayout(fleet, updateData);
    policy.parseCatalogAndReviews(updateData);
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
