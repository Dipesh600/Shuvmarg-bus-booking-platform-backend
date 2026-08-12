"use strict";

const revisions = require("../../fleet-management/seat-layout-revision");
const { getAdminActor, resolveAuthorizedAdminActor } = require(
  "../bus-owner-management/admin-actor.resolver"
);
const { ApiError, mapApiError } = require("../../../contracts");

async function adminId(req) {
  const admin = await resolveAuthorizedAdminActor(getAdminActor(req));
  return admin._id;
}

async function listPending(_req, res) {
  try {
    return res.status(200).json({
      success: true,
      data: { revisions: await revisions.listPending() },
    });
  } catch (error) {
    const mapped = mapApiError(
      error instanceof ApiError ? error : new ApiError("FLEET_UPDATE_FAILED"),
      console
    );
    return res.status(mapped.statusCode).json(mapped.payload);
  }
}

async function decide(req, res) {
  try {
    const revision = await revisions.decideRevision({
      revisionId: req.params.revisionId,
      decision: req.body?.decision,
      effectiveAt: req.body?.effectiveAt,
      rejectionReason: req.body?.rejectionReason,
      adminId: await adminId(req),
    });
    return res.status(200).json({
      success: true,
      message: revision.status === "REJECTED"
        ? "Seat layout revision rejected."
        : "Seat layout revision approved and scheduled.",
      data: { revision },
    });
  } catch (error) {
    const mapped = mapApiError(
      error instanceof ApiError ? error : new ApiError("FLEET_UPDATE_FAILED"),
      console
    );
    return res.status(mapped.statusCode).json(mapped.payload);
  }
}

module.exports = { listPending, decide };
