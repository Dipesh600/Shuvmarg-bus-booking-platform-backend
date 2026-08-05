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
    const owner = await BusOwnerModel.findOne({ user: userId }).select("_id user").lean();
    const ids = [userId];
    if (owner?._id) ids.push(owner._id);
    return ids;
  }

  async function findAdminPaginatedFleets(params) {
    const { page, limit, skip, ownerId } = params;
    const ownerIds = ownerId ? await resolveOwnerObjectIds(ownerId) : [];
    const filter = buildAdminFleetFilter(params, ownerIds);

    const [rawFleets, totalItems] = await Promise.all([
      FleetModel.find(filter)
        .populate({ path: "busOwnerId", populate: { path: "user", select: "name email phone" } })
        .populate("operatorId", "name email")
        .populate("approvedBy", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      FleetModel.countDocuments(filter),
    ]);

    const items = rawFleets.map(mapAdminFleetListItem).filter(Boolean);
    return { items, totalItems };
  }

  async function findAdminFleetDetailById(id) {
    const fleet = await FleetModel.findById(id)
      .populate({ path: "busOwnerId", populate: { path: "user", select: "name email phone" } })
      .populate("operatorId", "name email")
      .populate("approvedBy", "name email")
      .lean();

    if (!fleet) {
      throw new ReadContractNotFoundError("FLEET_NOT_FOUND", "Fleet record not found.");
    }

    return mapAdminFleetDetail(fleet);
  }

  async function findFleetSetupStatusDataById(id) {
    const fleet = await FleetModel.findById(id).lean();
    if (!fleet) {
      throw new ReadContractNotFoundError("FLEET_NOT_FOUND", "Fleet record not found.");
    }
    return fleet;
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
    findFleetSetupStatusDataById,
    findOwnerPaginatedFleets,
    findOwnerFleetDetailById,
  };
}

module.exports = {
  createFleetReadRepository,
};
