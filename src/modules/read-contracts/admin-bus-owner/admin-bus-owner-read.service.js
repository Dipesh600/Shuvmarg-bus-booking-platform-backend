"use strict";

const mongoose = require("mongoose");
const { getAdminActor, resolveAuthorizedAdminActor } = require("../../admin/bus-owner-management/admin-actor.resolver");
const { parsePagination, formatPagination } = require("../common/read-pagination.policy");
const { ReadContractValidationError, ReadContractForbiddenError } = require("../common/read-errors");
const { createAdminBusOwnerRepository } = require("./admin-bus-owner.repository");

function createAdminBusOwnerReadService({
  repository = createAdminBusOwnerRepository(),
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

  async function listBusOwners(req) {
    await authorizeAdmin(req);
    const { page, limit, skip } = parsePagination(req.query);
    const { search, verificationStatus } = req.query || {};

    const { items, totalItems } = await repository.findPaginatedOwners({
      page,
      limit,
      skip,
      search,
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

  async function getBusOwnerDetail(req) {
    await authorizeAdmin(req);
    const id = req.body?.id || req.query?.id || req.params?.id;

    if (!id || typeof id !== "string") {
      throw new ReadContractValidationError("READ_INVALID_ID", "Bus owner ID is required.");
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ReadContractValidationError("READ_INVALID_ID", "Invalid bus owner ID format.");
    }

    const data = await repository.findOwnerDetailById(id);
    return {
      success: true,
      data,
    };
  }

  return {
    listBusOwners,
    getBusOwnerDetail,
  };
}

module.exports = {
  createAdminBusOwnerReadService,
};
