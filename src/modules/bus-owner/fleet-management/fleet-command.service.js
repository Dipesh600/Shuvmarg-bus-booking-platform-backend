"use strict";

const { ApiError } = require("../../../contracts");

function createBusOwnerFleetCommandService({ fleetService, submissionService, layoutRevisions }) {
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
      message: "Fleet draft created successfully!",
      data: { fleet },
    };
  }

  async function updateFleetForOwner(req) {
    const ownerId = req.userInfo?.id;
    if (!ownerId) {
      throw new ApiError("AUTHENTICATION_REQUIRED");
    }

    const fleetId = req.params?.fleetId || req.body?.fleetId;
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

  async function submitFleetForOwner(req) {
    const ownerId = req.userInfo?.id;
    if (!ownerId) {
      throw new ApiError("AUTHENTICATION_REQUIRED");
    }

    const fleetId = req.params?.fleetId || req.body?.fleetId;

    if (!fleetId && req.body && req.body.busName && req.body.busNumber) {
      const createdFleet = await fleetService.createFleet(
        ownerId,
        req.body,
        req.files,
        "BUS_OWNER"
      );

      try {
        const submitted = await submissionService.submitFleetForVerification({
          fleetId: createdFleet._id.toString(),
          ownerId,
        });
        return {
          success: true,
          message: "Fleet submitted for verification successfully!",
          data: { fleet: submitted },
        };
      } catch (subErr) {
        const errCode = subErr.code || subErr.errorCode;
        if (errCode === "PROFILE_NOT_APPROVED") {
          if (createdFleet?._id) {
            await fleetService.removeFleet(createdFleet._id, ownerId).catch(() => {});
          }
          throw subErr;
        }
        if (errCode === "FLEET_SUBMISSION_INCOMPLETE") {
          const payloadDetails = {
            fleetId: createdFleet._id.toString(),
            ...(subErr.details || {}),
          };
          throw new ApiError("FLEET_SUBMISSION_INCOMPLETE", {
            details: payloadDetails,
          });
        }
        throw subErr;
      }
    }

    if (!fleetId) {
      throw new ApiError("FLEET_INVALID_ID", "Fleet ID is required.");
    }

    const fleet = await submissionService.submitFleetForVerification({
      fleetId,
      ownerId,
    });

    return {
      success: true,
      message: "Fleet submitted for verification successfully!",
      data: { fleet },
    };
  }

  async function requestSeatLayoutRevision(req) {
    const ownerId = req.userInfo?.id;
    if (!ownerId) throw new ApiError("AUTHENTICATION_REQUIRED");
    const revision = await layoutRevisions.requestRevision({
      fleetId: req.params?.fleetId,
      ownerId,
      proposedSeatConfig: req.body?.seatConfig,
      effectiveAt: req.body?.effectiveAt,
      reason: req.body?.reason,
    });
    return {
      success: true,
      message: revision.status === "APPLIED"
        ? "Seat additions applied successfully."
        : "Seat withdrawal submitted for admin review.",
      data: { revision },
    };
  }

  async function listSeatLayoutRevisions(req) {
    const ownerId = req.userInfo?.id;
    if (!ownerId) throw new ApiError("AUTHENTICATION_REQUIRED");
    const revisions = await layoutRevisions.listForFleet(req.params?.fleetId, ownerId);
    return { success: true, data: { revisions } };
  }

  return {
    createFleetForOwner,
    updateFleetForOwner,
    deleteFleetForOwner,
    submitFleetForOwner,
    requestSeatLayoutRevision,
    listSeatLayoutRevisions,
  };
}

module.exports = { createBusOwnerFleetCommandService };
