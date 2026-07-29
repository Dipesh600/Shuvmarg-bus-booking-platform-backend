"use strict";

function send(res, result) {
  return res.status(result.statusCode).json(result.body);
}

function createFleetManagementController({
  listFleets,
  getFleetDetail,
  updateFleetStatus,
  getFleetDashboard,
  getFleetSetupStatus,
  console,
}) {
  return {
    async getAllFleet(req, res) {
      try {
        return send(res, await listFleets(req.query));
      } catch (error) {
        console.error("Error fetching fleets:", error);
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
        console.error("Error fetching fleet by ID:", error);
        return res.status(500).json({
          success: false,
          message: "Internal server error",
          error: error.message,
        });
      }
    },

    async updateFleetStatus(req, res) {
      try {
        return send(res, await updateFleetStatus(req.body));
      } catch (error) {
        console.error("Error updating fleet status:", error);
        return res.status(500).json({
          success: false,
          message: "Internal server error",
          error: error.message,
        });
      }
    },

    async getFleetDashboard(_req, res) {
      try {
        return send(res, await getFleetDashboard());
      } catch (error) {
        console.error("Error fetching fleet dashboard stats:", error);
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
