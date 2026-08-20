
"use strict";

const mongoose = require("mongoose");
const { resolveAuthorizedAdminActor } = require("../../admin/bus-owner-management/admin-actor.resolver");
const { parsePagination, formatPagination } = require("../common/read-pagination.policy");
const { ReadContractValidationError, ReadContractNotFoundError } = require("../common/read-errors");
const { createFleetReadRepository } = require("./fleet-read.repository");
const { mapFleetSetupStatus } = require("./fleet-setup-status.dto");
const { createDefaultCanonicalSetupService } = require("./canonical-setup-service.resolver");
const { authorizeAdmin, authorizeOwner } = require("./fleet-read-auth.guard");

function createFleetReadService({
  repository = createFleetReadRepository(),
  getCanonicalSetupStatus = createDefaultCanonicalSetupService(),
  resolveAdminActor = resolveAuthorizedAdminActor,
} = {}) {
  async function listFleetsForAdmin(req) {
    await authorizeAdmin(req, resolveAdminActor);
    const { page, limit, skip } = parsePagination(req.query);
    const { search, status, approvalStatus, ownerId, brandId, operational } = req.query || {};

    const { items, totalItems } = await repository.findAdminPaginatedFleets({
      page,
      limit,
      skip,
      search,
      status,
      approvalStatus,
      ownerId,
      brandId,
      operational,
    });

    return {
      success: true,
      data: {
        items,
        pagination: formatPagination({ page, limit, totalItems }),
      },
    };
  }

  async function getFleetDetailForAdmin(req) {
    await authorizeAdmin(req, resolveAdminActor);
    const id = req.params?.id || req.body?.id || req.query?.id;

    if (!id || typeof id !== "string") {
      throw new ReadContractValidationError("READ_INVALID_ID", "Fleet ID is required.");
    }
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ReadContractValidationError("READ_INVALID_ID", "Invalid fleet ID format.");
    }

    const data = await repository.findAdminFleetDetailById(id);
    return { success: true, data };
  }

  async function getFleetSetupStatusForAdmin(req) {
    await authorizeAdmin(req, resolveAdminActor);
    const id = req.params?.id || req.body?.id || req.query?.id;

    if (!id || typeof id !== "string" || !mongoose.Types.ObjectId.isValid(id)) {
      throw new ReadContractValidationError("READ_INVALID_ID", "Valid fleet ID is required.");
    }

    const result = await getCanonicalSetupStatus(id);
    if (!result || result.statusCode === 404) {
      throw new ReadContractNotFoundError("FLEET_NOT_FOUND", "Fleet record not found.");
    }

    const canonicalData = result.body?.data || result.data || result;
    return {
      success: true,
      data: mapFleetSetupStatus(canonicalData),
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

    return {
      success: true,
      data: {
        items,
        pagination: formatPagination({ page, limit, totalItems }),
      },
    };
  }

  async function getFleetDetailForOwner(req) {
    const authenticatedUserId = authorizeOwner(req);
    const fleetId = req.params?.fleetId || req.params?.id || req.body?.fleetId || req.body?.id || req.query?.fleetId;

    if (!fleetId || typeof fleetId !== "string" || !mongoose.Types.ObjectId.isValid(fleetId)) {
      throw new ReadContractValidationError("READ_INVALID_ID", "Valid fleet ID is required.");
    }

    const data = await repository.findOwnerFleetDetailById({
      fleetId,
      userId: authenticatedUserId,
    });

    return { success: true, data };
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
