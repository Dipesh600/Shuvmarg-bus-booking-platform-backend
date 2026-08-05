"use strict";

const BusOwner = require("../../../../models/busOwnerModel");
const { ReadContractValidationError, ReadContractNotFoundError } = require("../common/read-errors");
const { mapAdminKycQueueItem } = require("./admin-kyc-list.dto");
const { mapAdminKycDetail } = require("./admin-kyc-detail.dto");

function createAdminKycRepository({
  BusOwnerModel = BusOwner,
} = {}) {
  async function findPaginatedKycs({ page, limit, skip, verificationStatus }) {
    const filter = {};
    if (verificationStatus) {
      const norm = String(verificationStatus).toLowerCase();
      if (!["pending", "approved", "rejected"].includes(norm)) {
        throw new ReadContractValidationError(
          "READ_INVALID_FILTER",
          "Verification status filter must be one of: pending, approved, rejected."
        );
      }
      filter.verificationStatus = norm;
    }

    const [rawList, totalItems] = await Promise.all([
      BusOwnerModel.find(filter)
        .populate("user", "name email phone role")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      BusOwnerModel.countDocuments(filter),
    ]);

    const items = rawList.map(mapAdminKycQueueItem).filter(Boolean);

    return { items, totalItems };
  }

  async function findKycDetailById(id) {
    let owner = await BusOwnerModel.findOne({ user: id })
      .populate("user", "name email phone role")
      .populate("approvedBy", "name email")
      .populate("kycReview.reviewedBy", "name email")
      .lean();

    if (!owner) {
      owner = await BusOwnerModel.findById(id)
        .populate("user", "name email phone role")
        .populate("approvedBy", "name email")
        .populate("kycReview.reviewedBy", "name email")
        .lean();
    }

    if (!owner) {
      throw new ReadContractNotFoundError("BUS_OWNER_KYC_NOT_FOUND", "Bus owner KYC record not found.");
    }

    return mapAdminKycDetail(owner);
  }

  return {
    findPaginatedKycs,
    findKycDetailById,
  };
}

module.exports = {
  createAdminKycRepository,
};
