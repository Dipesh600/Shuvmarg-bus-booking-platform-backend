"use strict";

const { ApiError } = require("../../../contracts");

function createBusOwnerFleetCommandService({ fleetService }) {
  async function createFleetForOwner(req) {
    const ownerId = req.userInfo?.id;
    if (!ownerId) {
      throw new ApiError("AUTHENTICATION_REQUIRED");
    }

    try {
      const fleet = await fleetService.createFleet(
        ownerId,
        req.body,
        req.files,
        "BUS_OWNER"
      );

      return {
        success: true,
        message: "Fleet details submitted for verification successfully!",
        data: { fleet },
      };
    } catch (err) {
      if (err instanceof ApiError) throw err;
      const msg = (err?.message || "").toLowerCase();
      if (msg.includes("exists")) {
        throw new ApiError("FLEET_ALREADY_EXISTS");
      }
      throw err;
    }
  }

  async function updateFleetForOwner(req) {
    const ownerId = req.userInfo?.id;
    if (!ownerId) {
      throw new ApiError("AUTHENTICATION_REQUIRED");
    }

    const fleetId = req.params?.fleetId;
    if (!fleetId) {
      throw new ApiError("FLEET_INVALID_ID");
    }

    try {
      const fleet = await fleetService.updateFleetDetails(
        fleetId,
        req.body,
        req.files,
        ownerId
      );

      return {
        success: true,
        message: "Fleet details updated successfully!",
        data: { fleet },
      };
    } catch (err) {
      if (err instanceof ApiError) throw err;
      const msg = (err?.message || "").toLowerCase();
      if (msg.includes("not found") || msg.includes("unauthorized") || msg.includes("not owned")) {
        throw new ApiError("FLEET_NOT_FOUND");
      }
      throw err;
    }
  }

  async function deleteFleetForOwner(req) {
    const ownerId = req.userInfo?.id;
    if (!ownerId) {
      throw new ApiError("AUTHENTICATION_REQUIRED");
    }

    const fleetId = req.params?.fleetId;
    if (!fleetId) {
      throw new ApiError("FLEET_INVALID_ID");
    }

    try {
      await fleetService.removeFleet(fleetId, ownerId);

      return {
        success: true,
        message: "Fleet deleted successfully!",
        data: { fleetId },
      };
    } catch (err) {
      if (err instanceof ApiError) throw err;
      const msg = (err?.message || "").toLowerCase();
      if (msg.includes("not found") || msg.includes("unauthorized") || msg.includes("not owned")) {
        throw new ApiError("FLEET_NOT_FOUND");
      }
      throw err;
    }
  }

  return {
    createFleetForOwner,
    updateFleetForOwner,
    deleteFleetForOwner,
  };
}

module.exports = { createBusOwnerFleetCommandService };
