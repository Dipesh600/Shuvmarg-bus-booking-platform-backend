"use strict";

const { FLEET_REVIEW_KEYS } = require("../../src/modules/admin/fleet-management/fleet-review-requirements");

function approvedFleetReviews() {
  return Object.fromEntries(FLEET_REVIEW_KEYS.map((key) => [key, { status: "APPROVED", reason: null }]));
}

function rejectedFleetReviews(key = "insurance", reason = "Document needs correction") {
  const reviews = approvedFleetReviews();
  reviews[key] = { status: "REJECTED", reason };
  return reviews;
}

module.exports = { approvedFleetReviews, rejectedFleetReviews };
