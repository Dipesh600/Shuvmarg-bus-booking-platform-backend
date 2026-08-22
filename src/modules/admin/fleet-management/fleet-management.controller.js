"use strict";

const { getAdminActor } = require("../bus-owner-management/admin-actor.resolver");
const { mapFleetApprovalError } = require("./fleet-approval-error.mapper");
const { createFleetReadService } = require("../../read-contracts/fleet/fleet-read.service");
const { mapReadError } = require("../../read-contracts/common/read-error.mapper");

const defaultReadService = createFleetReadService();

function send(res, result) {
  return res.status(result.statusCode).json(result.body);
}

function createFleetManagementController({
  updateFleetStatus,
  saveFleetReviewItem,
  getFleetDashboard,
  readService = defaultReadService,
  console: logger = console,
} = {}) {
  return {
    async getAllFleet(req, res) {
      try {
        const result = await readService.listFleetsForAdmin(req);
        return res.status(200).json(result);
      } catch (error) {
        const { statusCode, payload } = mapReadError(error, logger);
        return res.status(statusCode).json(payload);
      }
    },

    async getFleetById(req, res) {
      try {
        const result = await readService.getFleetDetailForAdmin(req);
        return res.status(200).json(result);
      } catch (error) {
        const { statusCode, payload } = mapReadError(error, logger);
        return res.status(statusCode).json(payload);
      }
    },

    async updateFleetStatus(req, res) {
      try {
        const result = await updateFleetStatus({
          ...(req.body || {}),
          actor: getAdminActor(req),
        });
        return res.status(200).json(result);
      } catch (error) {
        logger.error("Error updating fleet status:", error);
        const { statusCode, payload } = mapFleetApprovalError(error);
        return res.status(statusCode).json(payload);
      }
    },

    async saveFleetReviewItem(req, res) {
      try {
        const result = await saveFleetReviewItem({
          ...(req.body || {}),
          fleetId: req.params.fleetId,
          key: req.params.key,
          actor: getAdminActor(req),
        });
        return res.status(200).json(result);
      } catch (error) {
        const { statusCode, payload } = mapFleetApprovalError(error);
        return res.status(statusCode).json(payload);
      }
    },

    async getFleetDashboard(_req, res) {
      try {
        return send(res, await getFleetDashboard());
      } catch (error) {
        logger.error("Error fetching fleet dashboard stats:", error);
        return res.status(500).json({
          success: false,
          message: "Internal server error",
        });
      }
    },

    async getFleetSetupStatus(req, res) {
      try {
        const result = await readService.getFleetSetupStatusForAdmin(req);
        return res.status(200).json(result);
      } catch (error) {
        const { statusCode, payload } = mapReadError(error, logger);
        return res.status(statusCode).json(payload);
      }
    },
  };
}

module.exports = { createFleetManagementController };
