"use strict";

const BusOwner = require("../../../../models/busOwnerModel");
const Fleet = require("../../../../models/fleetModel");
const User = require("../../../../models/userModel");
const { ReadContractValidationError, ReadContractNotFoundError } = require("../common/read-errors");
const { mapAdminBusOwnerListItem } = require("./admin-bus-owner-list.dto");
const { mapAdminBusOwnerDetail } = require("./admin-bus-owner-detail.dto");

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createAdminBusOwnerRepository({
  BusOwnerModel = BusOwner,
  UserModel = User,
  FleetModel = Fleet,
} = {}) {
  async function findPaginatedOwners({ page, limit, skip, search, verificationStatus }) {
    const filter = {};
    if (verificationStatus) {
      if (!["pending", "approved", "rejected"].includes(verificationStatus)) {
        throw new ReadContractValidationError(
          "READ_INVALID_FILTER",
          "Verification status filter must be one of: pending, approved, rejected."
        );
      }
      filter.verificationStatus = verificationStatus;
    }

    if (search && typeof search === "string" && search.trim().length > 0) {
      const safeSearch = escapeRegex(search.trim());
      const matchingUsers = await UserModel.find({
        $or: [
          { name: new RegExp(safeSearch, "i") },
          { email: new RegExp(safeSearch, "i") },
          { phone: new RegExp(safeSearch, "i") },
        ],
      })
        .select("_id")
        .lean();

      const userIds = matchingUsers.map((u) => u._id);
      filter.$or = [
        { user: { $in: userIds } },
        { companyName: new RegExp(safeSearch, "i") },
        { busOwnerId: new RegExp(safeSearch, "i") },
      ];
    }

    const [rawOwners, totalItems] = await Promise.all([
      BusOwnerModel.find(filter)
        .populate("user", "name email phone profilePicture status")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      BusOwnerModel.countDocuments(filter),
    ]);

    const ownerIds = rawOwners.map((o) => o._id);
    let fleetCountMap = {};

    if (ownerIds.length > 0) {
      const counts = await FleetModel.aggregate([
        { $match: { busOwnerId: { $in: ownerIds } } },
        { $group: { _id: "$busOwnerId", count: { $sum: 1 } } },
      ]);
      fleetCountMap = Object.fromEntries(counts.map((c) => [String(c._id), c.count]));
    }

    const items = rawOwners
      .map((owner) => mapAdminBusOwnerListItem(owner, fleetCountMap[String(owner._id)] || 0))
      .filter(Boolean);

    return { items, totalItems };
  }

  async function findOwnerDetailById(id) {
    let owner = await BusOwnerModel.findOne({ user: id })
      .populate("user", "name email phone profilePicture status")
      .populate("approvedBy", "name email")
      .populate("kycReview.reviewedBy", "name email")
      .lean();

    if (!owner) {
      owner = await BusOwnerModel.findById(id)
        .populate("user", "name email phone profilePicture status")
        .populate("approvedBy", "name email")
        .populate("kycReview.reviewedBy", "name email")
        .lean();
    }

    if (!owner) {
      throw new ReadContractNotFoundError("BUS_OWNER_NOT_FOUND", "Bus owner record not found.");
    }

    const fleets = await FleetModel.find({ busOwnerId: owner._id }).lean();
    return mapAdminBusOwnerDetail(owner, fleets);
  }

  return {
    findPaginatedOwners,
    findOwnerDetailById,
  };
}

module.exports = {
  createAdminBusOwnerRepository,
};
