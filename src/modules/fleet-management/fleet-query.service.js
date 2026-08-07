"use strict";

const { ApiError } = require("../../contracts");

function createFleetQueryService({ repository, mapper }) {
  async function getFleetsByOwnerId(ownerId, brandId) {
    const fleets = await repository.findByOwner(ownerId, brandId);
    return Promise.all(fleets.map(mapper.withPresignedUrls));
  }

  async function getFleetDetails(fleetId, ownerId = null) {
    const fleet = await repository.findDetails(fleetId, ownerId);
    if (!fleet) throw new ApiError("FLEET_NOT_FOUND", "Fleet not found or unauthorized.");
    return mapper.withPresignedUrls(fleet);
  }

  async function getFleetDetailsRaw(fleetId) {
    const fleet = await repository.findRaw(fleetId);
    if (!fleet) throw new ApiError("FLEET_NOT_FOUND", "Fleet not found or unauthorized.");
    return mapper.withRawKeys(fleet);
  }

  async function removeFleet(fleetId, ownerId = null) {
    const existing = await repository.findDocument(fleetId, ownerId);
    if (!existing) throw new ApiError("FLEET_NOT_FOUND", "Fleet not found or unauthorized.");
    if (existing.approvalStatus === "PENDING" || existing.approvalStatus === "APPROVED") {
      throw new ApiError(
        "FLEET_MUTATION_LOCKED",
        `Fleet is currently ${existing.approvalStatus.toLowerCase()} and cannot be deleted.`,
        409
      );
    }
    const fleet = await repository.remove(fleetId, ownerId);
    if (!fleet) throw new ApiError("FLEET_NOT_FOUND", "Fleet not found or unauthorized.");
    return fleet;
  }

  return {
    getFleetsByOwnerId, getFleetDetails, getFleetDetailsRaw, removeFleet,
  };
}

module.exports = { createFleetQueryService };
