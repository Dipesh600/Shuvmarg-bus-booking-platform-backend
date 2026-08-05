"use strict";

const mongoose = require("mongoose");
const { ReadContractValidationError } = require("../common/read-errors");

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildAdminFleetFilter({ search, status, approvalStatus, ownerId }, ownerIds) {
  const filter = {};

  if (approvalStatus) {
    const norm = String(approvalStatus).toUpperCase();
    if (!["PENDING", "APPROVED", "REJECTED"].includes(norm)) {
      throw new ReadContractValidationError("READ_INVALID_FILTER", "Invalid approvalStatus filter.");
    }
    filter.approvalStatus = norm;
  }

  if (status) {
    const norm = String(status).toUpperCase();
    if (!["ACTIVE", "INACTIVE", "MAINTENANCE"].includes(norm)) {
      throw new ReadContractValidationError("READ_INVALID_FILTER", "Invalid status filter.");
    }
    filter.status = new RegExp(`^${norm}$`, "i");
  }

  if (ownerId) {
    if (!mongoose.Types.ObjectId.isValid(ownerId)) {
      throw new ReadContractValidationError("READ_INVALID_FILTER", "Invalid ownerId filter.");
    }
    filter.$or = [{ ownerId: { $in: ownerIds } }, { busOwnerId: { $in: ownerIds } }];
  }

  if (search && typeof search === "string" && search.trim().length > 0) {
    const trimmed = search.trim();
    if (trimmed.length > 100) {
      throw new ReadContractValidationError("READ_INVALID_FILTER", "Search term exceeds maximum length of 100 characters.");
    }
    const safeSearch = escapeRegex(trimmed);
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

  return filter;
}

module.exports = {
  escapeRegex,
  buildAdminFleetFilter,
};
