"use strict";

const mongoose = require("mongoose");
const Fleet = require("../../../../models/fleetModel");
const BusOwner = require("../../../../models/busOwnerModel");
const { ReadContractValidationError, ReadContractNotFoundError } = require("../common/read-errors");
const { mapAdminFleetListItem } = require("./admin-fleet-list.dto");
const { mapAdminFleetDetail } = require("./admin-fleet-detail.dto");
const { mapBusOwnerFleetListItem } = require("./bus-owner-fleet-list.dto");
const { mapBusOwnerFleetDetail } = require("./bus-owner-fleet-detail.dto");
const { buildAdminFleetFilter } = require("./fleet-read-filter.builder");

function createFleetReadRepository({
  FleetModel = Fleet,
  BusOwnerModel = BusOwner,
} = {}) {
  async function resolveOwnerObjectIds(userId) {
    if (!userId || typeof userId !== "string" || !mongoose.Types.ObjectId.isValid(userId)) {
      throw new ReadContractValidationError("READ_INVALID_FILTER", "Invalid ownerId filter.");
    }
    const owner = await BusOwnerModel.findOne({ $or: [{ _id: userId }, { user: userId }] }).select("_id user").lean();
    const ids = [userId];
    if (owner?._id) ids.push(owner._id);
    if (owner?.user) ids.push(owner.user);
    return ids;
  }

  async function findAdminPaginatedFleets(params) {
    const { page, limit, skip, ownerId } = params;
    const ownerIds = ownerId ? await resolveOwnerObjectIds(ownerId) : [];
    const filter = buildAdminFleetFilter(params, ownerIds);

    let rawFleets, totalItems;
    try {
      [rawFleets, totalItems] = await Promise.all([
        FleetModel.find(filter)
          .populate({ path: "ownerId", select: "name email phone", options: { strictPopulate: false } })
          .populate({ path: "brandId", select: "brandName brandCode ownerId", options: { strictPopulate: false } })
          .populate({ path: "approvedBy", select: "name email", options: { strictPopulate: false } })
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        FleetModel.countDocuments(filter),
      ]);
    } catch (populateError) {
      // Fallback: query without populate if refs are corrupt
      console.error("Fleet list populate failed, falling back to unpopulated query:", populateError?.message);
      [rawFleets, totalItems] = await Promise.all([
        FleetModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
        FleetModel.countDocuments(filter),
      ]);
    }

    const items = rawFleets.map(mapAdminFleetListItem).filter(Boolean);
    return { items, totalItems };
  }

  async function findAdminFleetDetailById(id) {
    let fleet;
    try {
      fleet = await FleetModel.findById(id)
        .populate({ path: "ownerId", select: "name email phone", options: { strictPopulate: false } })
        .populate({ path: "brandId", select: "brandName brandCode ownerId", options: { strictPopulate: false } })
        .populate({ path: "approvedBy", select: "name email", options: { strictPopulate: false } })
        .lean();
    } catch (populateError) {
      // Fallback: fetch without populate if refs are corrupt
      console.error("Fleet detail populate failed, falling back:", populateError?.message);
      fleet = await FleetModel.findById(id).lean();
    }

    if (!fleet) {
      throw new ReadContractNotFoundError("FLEET_NOT_FOUND", "Fleet record not found.");
    }

    return mapAdminFleetDetail(fleet);
  }

  async function findOwnerPaginatedFleets({ userId, page, limit, skip }) {
    const ownerIds = await resolveOwnerObjectIds(userId);
    const filter = {
      $or: [{ ownerId: { $in: ownerIds } }, { busOwnerId: { $in: ownerIds } }],
    };

    const [rawFleets, totalItems] = await Promise.all([
      FleetModel.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      FleetModel.countDocuments(filter),
    ]);

    const items = rawFleets.map(mapBusOwnerFleetListItem).filter(Boolean);
    return { items, totalItems };
  }

  async function findOwnerFleetDetailById({ fleetId, userId }) {
    const ownerIds = await resolveOwnerObjectIds(userId);
    const fleet = await FleetModel.findOne({
      _id: fleetId,
      $or: [{ ownerId: { $in: ownerIds } }, { busOwnerId: { $in: ownerIds } }],
    }).lean();

    if (!fleet) {
      throw new ReadContractNotFoundError("FLEET_NOT_FOUND", "Fleet record not found or not owned by user.");
    }

    return mapBusOwnerFleetDetail(fleet);
  }

  return {
    findAdminPaginatedFleets,
    findAdminFleetDetailById,
    findOwnerPaginatedFleets,
    findOwnerFleetDetailById,
  };
}

module.exports = {
  createFleetReadRepository,
};
