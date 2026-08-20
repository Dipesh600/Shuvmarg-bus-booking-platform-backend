"use strict";

const { toIsoDate } = require("../common/read-date.mapper");

function mapFleetSeatLayout(assignment, revision) {
  if (!assignment) return { assigned: false };

  return {
    assigned: true,
    templateId: assignment.templateId ? String(assignment.templateId) : null,
    revisionId: assignment.activeRevisionId ? String(assignment.activeRevisionId) : null,
    assignmentVersion: assignment.assignmentVersion || 1,
    assignedAt: toIsoDate(assignment.assignedAt),
    revisionNumber: revision?.revisionNumber || null,
    status: revision?.status || null,
    totalPlaces: revision?.totalPlaces || null,
    layout: revision?.layout || null,
  };
}

module.exports = { mapFleetSeatLayout };
