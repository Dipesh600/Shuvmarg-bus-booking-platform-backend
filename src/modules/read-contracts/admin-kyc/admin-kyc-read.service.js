"use strict";

const mongoose = require("mongoose");
const { getAdminActor, resolveAuthorizedAdminActor } = require("../../admin/bus-owner-management/admin-actor.resolver");
const { parsePagination, formatPagination } = require("../common/read-pagination.policy");
const { ReadContractValidationError, ReadContractForbiddenError } = require("../common/read-errors");
const { createAdminKycRepository } = require("./admin-kyc.repository");

function createAdminKycReadService({
  repository = createAdminKycRepository(),
  resolveAdminActor = resolveAuthorizedAdminActor,
} = {}) {
  async function authorizeAdmin(req) {
    const actor = getAdminActor(req);
    if (!actor) return null;
    const resolved = await resolveAdminActor(actor);
    if (!resolved || resolved.status === "inactive" || resolved.isLocked) {
      throw new ReadContractForbiddenError("READ_FORBIDDEN", "Admin account is inactive or locked.");
    }
    return resolved;
  }

  async function listKycQueue(req) {
    await authorizeAdmin(req);
    const { page, limit, skip } = parsePagination(req.query);
    const { verificationStatus } = req.query || {};

    const { items, totalItems } = await repository.findPaginatedKycs({
      page,
      limit,
      skip,
      verificationStatus,
    });

    const pagination = formatPagination({ page, limit, totalItems });
    return {
      success: true,
      data: {
        items,
        pagination,
      },
    };
  }

  async function getKycDetail(req) {
    await authorizeAdmin(req);
    const id = req.body?.id || req.query?.id || req.params?.id;

    if (!id || typeof id !== "string") {
      throw new ReadContractValidationError("READ_INVALID_ID", "KYC owner ID is required.");
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ReadContractValidationError("READ_INVALID_ID", "Invalid owner ID format.");
    }

    const data = await repository.findKycDetailById(id);
    return {
      success: true,
      data,
    };
  }

  return {
    listKycQueue,
    getKycDetail,
  };
}

module.exports = {
  createAdminKycReadService,
};
