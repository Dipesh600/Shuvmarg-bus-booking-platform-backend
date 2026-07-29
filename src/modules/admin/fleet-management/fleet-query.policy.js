"use strict";

function buildFleetQuery(input = {}) {
  const { operational, grounded, brandId, ownerId, approvalStatus } = input;
  const query = {};

  if (operational === "true") {
    query.setupComplete = true;
    query.approvalStatus = "APPROVED";
  } else if (grounded === "true") {
    query.setupComplete = false;
    query.approvalStatus = "APPROVED";
  } else if (approvalStatus) {
    query.approvalStatus = approvalStatus;
  }

  if (brandId) query.brandId = brandId;
  if (ownerId) query.ownerId = ownerId;
  return query;
}

function needsScheduleSummary(input = {}) {
  return input.operational === "true" || input.grounded === "true";
}

function getEmptyFleetMessage(input = {}) {
  if (input.operational === "true") {
    return "No buses are currently live on the network.";
  }
  if (input.grounded === "true") return "No grounded buses found.";
  return "No fleets registered yet.";
}

module.exports = {
  buildFleetQuery,
  needsScheduleSummary,
  getEmptyFleetMessage,
};
