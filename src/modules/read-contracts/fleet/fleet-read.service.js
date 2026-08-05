"use strict";

const mongoose = require("mongoose");
const { getAdminActor, resolveAuthorizedAdminActor } = require("../../admin/bus-owner-management/admin-actor.resolver");
const { parsePagination, formatPagination } = require("../common/read-pagination.policy");
const { ReadContractValidationError, ReadContractUnauthorizedError, ReadContractForbiddenError } = require("../common/read-errors");
const { createFleetReadRepository } = require("./fleet-read.repository");
const { mapFleetSetupStatus } = require("./fleet-setup-status.dto");

function createFleetReadService({
  repository = createFleetReadRepository(),
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

  function authorizeOwner(req) {
    const userId = req.userInfo?.id;
    if (!userId || typeof userId !== "string") {
      throw new ReadContractUnauthorizedError("UNAUTHORIZED_OWNER", "Bus owner authentication required.");
    }
    return userId;
  }

  async function listFleetsForAdmin(req) {
    await authorizeAdmin(req);
    const { page, limit, skip } = parsePagination(req.query);
    const { search, status, approvalStatus, ownerId } = req.query || {};

    const { items, totalItems } = await repository.findAdminPaginatedFleets({
      page,
      limit,
      skip,
      search,
      status,
      approvalStatus,
      ownerId,
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

  async function getFleetDetailForAdmin(req) {
    await authorizeAdmin(req);
    const id = req.params?.id || req.body?.id || req.query?.id;

    if (!id || typeof id !== "string") {
      throw new ReadContractValidationError("READ_INVALID_ID", "Fleet ID is required.");
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ReadContractValidationError("READ_INVALID_ID", "Invalid fleet ID format.");
    }

    const data = await repository.findAdminFleetDetailById(id);
    return {
      success: true,
      data,
    };
  }

  async function getFleetSetupStatusForAdmin(req) {
    await authorizeAdmin(req);
    const id = req.params?.id || req.body?.id || req.query?.id;

    if (!id || typeof id !== "string" || !mongoose.Types.ObjectId.isValid(id)) {
      throw new ReadContractValidationError("READ_INVALID_ID", "Valid fleet ID is required.");
    }

    const fleetDetail = await repository.findAdminFleetDetailById(id);
    const setupData = mapFleetSetupStatus(fleetDetail);

    return {
      success: true,
      data: setupData,
    };
  }

  async function listFleetsForOwner(req) {
    const authenticatedUserId = authorizeOwner(req);
    const { page, limit, skip } = parsePagination(req.query);

    const { items, totalItems } = await repository.findOwnerPaginatedFleets({
      userId: authenticatedUserId,
      page,
      limit,
      skip,
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

  async function getFleetDetailForOwner(req) {
    const authenticatedUserId = authorizeOwner(req);
    const fleetId = req.params?.id || req.body?.fleetId || req.body?.id || req.query?.fleetId;

    if (!fleetId || typeof fleetId !== "string" || !mongoose.Types.ObjectId.isValid(fleetId)) {
      throw new ReadContractValidationError("READ_INVALID_ID", "Valid fleet ID is required.");
    }

    const data = await repository.findOwnerFleetDetailById({
      fleetId,
      userId: authenticatedUserId,
    });

    return {
      success: true,
      data,
    };
  }

  return {
    listFleetsForAdmin,
    getFleetDetailForAdmin,
    getFleetSetupStatusForAdmin,
    listFleetsForOwner,
    getFleetDetailForOwner,
  };
}

module.exports = {
  createFleetReadService,
};
