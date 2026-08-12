"use strict";

const { ApiError } = require("../../contracts");

function createRevisionContext({ Fleet, Revision, Version }) {
  async function load(fleetId, ownerId = null) {
    const query = { _id: fleetId };
    if (ownerId) query.ownerId = ownerId;
    const fleet = await Fleet.findOne(query).lean();
    if (!fleet) throw new ApiError("FLEET_NOT_FOUND");
    if (fleet.approvalStatus !== "APPROVED") {
      throw new ApiError("FLEET_LAYOUT_CHANGE_BLOCKED", {
        details: { reason: "Only an approved fleet uses the governed layout revision workflow." },
      });
    }
    if (!fleet.seatLayoutVersionId) {
      throw new ApiError("FLEET_LAYOUT_INVALID", {
        details: { reason: "Migrate this fleet to a versioned layout before revising it." },
      });
    }
    const current = await Version.findById(fleet.seatLayoutVersionId).lean();
    if (!current) throw new ApiError("FLEET_LAYOUT_INVALID");
    return { fleet, current };
  }

  async function assertNoOpen(fleetId) {
    const open = await Revision.findOne({
      fleetId, status: { $in: ["PENDING_REVIEW", "APPLYING", "SCHEDULED"] },
    }).lean();
    if (open) throw new ApiError("FLEET_LAYOUT_CHANGE_BLOCKED", {
      details: {
        reason: "This fleet already has an open seat layout revision.",
        revisionId: open._id,
      },
    });
  }

  return { load, assertNoOpen };
}

module.exports = { createRevisionContext };
