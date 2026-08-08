"use strict";

const mongoose = require("mongoose");
const { ReadContractValidationError } = require("../common/read-errors");

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const { FLEET_APPROVAL_VALUES, FLEET_OPERATIONAL_VALUES } = require("../../../contracts");

function buildAdminFleetFilter({ search, status, approvalStatus, ownerId, brandId, operational }, ownerIds) {
  const filter = {};

  if (approvalStatus) {
    const norm = String(approvalStatus).toUpperCase();
    if (!FLEET_APPROVAL_VALUES.includes(norm)) {
      throw new ReadContractValidationError("READ_INVALID_FILTER", "Invalid approvalStatus filter.");
    }
    filter.approvalStatus = norm;
  }

  if (status) {
    const norm = String(status).toUpperCase();
    if (!FLEET_OPERATIONAL_VALUES.includes(norm)) {
      throw new ReadContractValidationError("READ_INVALID_FILTER", "Invalid status filter.");
    }
    filter.status = new RegExp(`^${norm}$`, "i");
  }

  if (ownerId) {
    if (!mongoose.Types.ObjectId.isValid(ownerId)) {
      throw new ReadContractValidationError("READ_INVALID_FILTER", "Invalid ownerId filter.");
    }
    filter.ownerId = { $in: ownerIds };
  }

  if (brandId) {
    if (!mongoose.Types.ObjectId.isValid(brandId)) {
      throw new ReadContractValidationError("READ_INVALID_FILTER", "Invalid brandId filter.");
    }
    filter.brandId = brandId;
  }

  if (operational !== undefined) {
    if (String(operational) !== "true" && String(operational) !== "false") {
      throw new ReadContractValidationError("READ_INVALID_FILTER", "Invalid operational filter.");
    }
    if (String(operational) === "true") {
      filter.approvalStatus = "APPROVED";
      filter.setupComplete = true;
    }
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
    filter.$or = searchFilter.$or;
  }

  return filter;
}

module.exports = {
  escapeRegex,
  buildAdminFleetFilter,
};
