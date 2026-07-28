"use strict";

function populateFleetQuery(query) {
  return query
    .populate("ownerId", "name email phone")
    .populate("amenitiesId")
    .populate("boardingPointId")
    .populate({
      path: "corridorId",
      select: "code originId destinationId status",
      populate: [
        { path: "originId", select: "name code city" },
        { path: "destinationId", select: "name code city" },
      ],
    })
    .populate("routeRequestId");
}

function createFleetQueryRepository({ Bus }) {
  function findByOwner(ownerId, brandId) {
    const query = { ownerId };
    if (brandId) query.brandId = brandId;
    return populateFleetQuery(Bus.find(query))
      .sort({ createdAt: -1 })
      .lean();
  }

  function findDetails(fleetId, ownerId = null) {
    const query = { _id: fleetId };
    if (ownerId) query.ownerId = ownerId;
    return populateFleetQuery(Bus.findOne(query)).lean();
  }

  function findRaw(fleetId) {
    return populateFleetQuery(Bus.findById(fleetId)).lean();
  }

  function findDocument(fleetId, ownerId = null) {
    const query = { _id: fleetId };
    if (ownerId) query.ownerId = ownerId;
    return Bus.findOne(query);
  }

  function remove(fleetId, ownerId = null) {
    const query = { _id: fleetId };
    if (ownerId) query.ownerId = ownerId;
    return Bus.findOneAndDelete(query);
  }

  return { findByOwner, findDetails, findRaw, findDocument, remove };
}

module.exports = { createFleetQueryRepository, populateFleetQuery };
