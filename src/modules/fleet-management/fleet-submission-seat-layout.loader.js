"use strict";

function createSeatLayoutLoader(Assignment, Revision) {
  return async function loadSeatLayout(fleetId) {
    const assignment = await Assignment.findOne({ fleetId }).select("activeRevisionId").lean();
    const revision = assignment
      ? await Revision.findById(assignment.activeRevisionId).select("status totalPlaces").lean()
      : null;
    return {
      assigned: Boolean(assignment),
      published: revision?.status === "PUBLISHED",
      totalPlaces: revision?.totalPlaces,
    };
  };
}

module.exports = { createSeatLayoutLoader };
