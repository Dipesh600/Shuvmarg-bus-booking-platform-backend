"use strict";

function createFleetQueryService({ repository, mapper }) {
  async function getFleetsByOwnerId(ownerId, brandId) {
    const fleets = await repository.findByOwner(ownerId, brandId);
    return Promise.all(fleets.map(mapper.withPresignedUrls));
  }

  async function getFleetDetails(fleetId, ownerId = null) {
    const fleet = await repository.findDetails(fleetId, ownerId);
    if (!fleet) throw new Error("Fleet not found or unauthorized.");
    return mapper.withPresignedUrls(fleet);
  }

  async function getFleetDetailsRaw(fleetId) {
    const fleet = await repository.findRaw(fleetId);
    if (!fleet) throw new Error("Fleet not found or unauthorized.");
    return mapper.withRawKeys(fleet);
  }

  async function removeFleet(fleetId, ownerId = null) {
    const fleet = await repository.remove(fleetId, ownerId);
    if (!fleet) throw new Error("Fleet not found or unauthorized.");
    return fleet;
  }

  return {
    getFleetsByOwnerId, getFleetDetails, getFleetDetailsRaw, removeFleet,
  };
}

module.exports = { createFleetQueryService };
