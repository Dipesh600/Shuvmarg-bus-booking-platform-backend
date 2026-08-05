"use strict";

const { getAdminActor } = require("../bus-owner-management/admin-actor.resolver");
const { mapFleetApprovalError } = require("./fleet-approval-error.mapper");

function send(res, result) {
  return res.status(result.statusCode).json(result.body);
}

function createFleetManagementController({
  listFleets,
  getFleetDetail,
  updateFleetStatus,
  getFleetDashboard,
  getFleetSetupStatus,
  console: logger = console,
}) {
  return {
    async getAllFleet(req, res) {
      try {
        return send(res, await listFleets(req.query));
      } catch (error) {
        logger.error("Error fetching fleets:", error);
        return res.status(500).json({
          success: false,
          message: "Internal server error",
          error: error.message,
        });
      }
    },

    async getFleetById(req, res) {
      try {
        return send(res, await getFleetDetail(req.params.id));
      } catch (error) {
        logger.error("Error fetching fleet by ID:", error);
        return res.status(500).json({
          success: false,
          message: "Internal server error",
          error: error.message,
        });
      }
    },

    async updateFleetStatus(req, res) {
      try {
        const actor = getAdminActor(req);
        const input = { ...(req.body || {}) };
        if (actor) input.actor = actor;
        const result = await updateFleetStatus(input);
        if (result && typeof result === "object" && result.statusCode) {
          return send(res, result);
        }
        return res.status(200).json(result);
      } catch (error) {
        logger.error("Error updating fleet status:", error);
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
          error: error.message,
        });
      }
    },

    async getFleetSetupStatus(req, res) {
      try {
        return send(res, await getFleetSetupStatus(req.params.id));
      } catch (error) {
        return res
          .status(500)
          .json({ success: false, message: error.message });
      }
    },
  };
}

module.exports = { createFleetManagementController };
