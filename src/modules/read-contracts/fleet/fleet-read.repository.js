"use strict";

const Fleet = require("../../../../models/fleetModel");
const BusOwner = require("../../../../models/busOwnerModel");
const { ReadContractValidationError, ReadContractNotFoundError } = require("../common/read-errors");
const { mapAdminFleetListItem } = require("./admin-fleet-list.dto");
const { mapAdminFleetDetail } = require("./admin-fleet-detail.dto");
const { mapBusOwnerFleetListItem } = require("./bus-owner-fleet-list.dto");
const { mapBusOwnerFleetDetail } = require("./bus-owner-fleet-detail.dto");

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createFleetReadRepository({
  FleetModel = Fleet,
  BusOwnerModel = BusOwner,
} = {}) {
  async function resolveOwnerObjectIds(userId) {
    const owner = await BusOwnerModel.findOne({ user: userId }).select("_id user").lean();
    const ids = [userId];
    if (owner?._id) ids.push(owner._id);
    return ids;
  }

  async function findAdminPaginatedFleets({ page, limit, skip, search, status, approvalStatus, ownerId }) {
    const filter = {};

    if (approvalStatus) {
      if (!["PENDING", "APPROVED", "REJECTED"].includes(approvalStatus.toUpperCase())) {
        throw new ReadContractValidationError(
          "READ_INVALID_FILTER",
          "Approval status filter must be one of: PENDING, APPROVED, REJECTED."
        );
      }
      filter.approvalStatus = approvalStatus.toUpperCase();
    }

    if (status) {
      filter.status = status;
    }

    if (ownerId) {
      const ownerIds = await resolveOwnerObjectIds(ownerId);
      filter.$or = [{ ownerId: { $in: ownerIds } }, { busOwnerId: { $in: ownerIds } }];
    }

    if (search && typeof search === "string" && search.trim().length > 0) {
      const safeSearch = escapeRegex(search.trim());
      const searchFilter = {
        $or: [
          { busName: new RegExp(safeSearch, "i") },
          { busNumber: new RegExp(safeSearch, "i") },
          { fleetId: new RegExp(safeSearch, "i") },
        ],
      };
      if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, searchFilter];
        delete filter.$or;
      } else {
        filter.$or = searchFilter.$or;
      }
    }

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
