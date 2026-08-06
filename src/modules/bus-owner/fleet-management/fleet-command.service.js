"use strict";

const { ApiError } = require("../../../contracts");

function createBusOwnerFleetCommandService({ fleetService }) {
  async function createFleetForOwner(req) {
    const ownerId = req.userInfo?.id;
    if (!ownerId) {
      throw new ApiError("AUTHENTICATION_REQUIRED");
    }

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

    await fleetService.removeFleet(fleetId, ownerId);

    return {
      success: true,
      message: "Fleet deleted successfully!",
      data: { fleetId },
    };
  }

  return {
    createFleetForOwner,
    updateFleetForOwner,
    deleteFleetForOwner,
  };
}

module.exports = { createBusOwnerFleetCommandService };
