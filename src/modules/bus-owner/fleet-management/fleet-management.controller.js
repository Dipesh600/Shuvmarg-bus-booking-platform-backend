"use strict";

const { createFleetReadService } = require("../../read-contracts/fleet/fleet-read.service");
const { mapReadError } = require("../../read-contracts/common/read-error.mapper");

const defaultReadService = createFleetReadService();

function unauthorized(res) {
  return res.status(401).json({
    success: false,
    message: "Unauthorized. Please login first.",
  });
}

function requireFleetId(req, res) {
  if (req.body && req.body.fleetId) return true;
  res.status(400).json({ success: false, message: "Fleet ID is required." });
  return false;
}

function createFleetManagementController({ fleetService, readService = defaultReadService, logger = console } = {}) {
  async function submitFleetForVerification(req, res) {
    try {
      const userId = req.userInfo?.id;
      if (!userId) return unauthorized(res);
      const data = await fleetService.createFleet(
        userId, req.body, req.files, "BUS_OWNER"
      );
      return res.status(201).json({
        success: true,
        message: "Fleet details submitted for verification successfully!",
        data,
      });
    } catch (error) {
      logger.error("submitFleetForVerification error:", error);
      return res.status(error.message.includes("exists") ? 409 : 400).json({
        success: false,
        message: error.message || "Internal Server Error",
      });
    }
  }

  async function getMyFleets(req, res) {
    try {
      const userId = req.userInfo?.id;
      if (!userId) return unauthorized(res);
      const result = await readService.listFleetsForOwner(req);
      return res.status(200).json(result);
    } catch (error) {
      const { statusCode, payload } = mapReadError(error, logger);
      return res.status(statusCode).json(payload);
    }
  }

  async function getFleetById(req, res) {
    try {
      const userId = req.userInfo?.id;
      if (!userId) return unauthorized(res);
      const { fleetId } = req.body;
      if (!requireFleetId(req, res)) return res;
      const result = await readService.getFleetDetailForOwner(req);
      return res.status(200).json(result);
    } catch (error) {
      logger.error("getFleetById error:", error);
      return res.status(error.message.includes("found") ? 404 : 500).json({
        success: false, message: error.message || "Internal Server Error",
      });
    }
  }

  async function updateFleet(req, res) {
    try {
      const userId = req.userInfo?.id;
      if (!userId) return unauthorized(res);
      const { fleetId } = req.body;
      if (!requireFleetId(req, res)) return res;
      const data = await fleetService.updateFleetDetails(
        fleetId, req.body, req.files, userId
      );
      return res.status(200).json({
        success: true, message: "Fleet details updated successfully!", data,
      });
    } catch (error) {
      logger.error("updateFleet error:", error);
      const status = error.message.includes("found")
        ? 404 : error.message.includes("exists") ? 409 : 400;
      return res.status(status).json({
        success: false, message: error.message || "Internal Server Error",
      });
    }
  }

  async function deleteFleet(req, res) {
    try {
      const userId = req.userInfo?.id;
      if (!userId) return unauthorized(res);
      const { fleetId } = req.body;
      if (!requireFleetId(req, res)) return res;
      await fleetService.removeFleet(fleetId, userId);
      return res.status(200).json({
        success: true, message: "Fleet deleted successfully!",
      });
    } catch (error) {
      logger.error("deleteFleet error:", error);
      return res.status(error.message.includes("found") ? 404 : 500).json({
        success: false, message: error.message || "Internal Server Error",
      });
    }
  }

  return {
    submitFleetForVerification, getMyFleets, getFleetById, updateFleet,
    deleteFleet,
  };
}

module.exports = { createFleetManagementController };
