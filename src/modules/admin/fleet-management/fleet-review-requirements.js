"use strict";

const DOCUMENT_REVIEW_KEYS = Object.freeze([
  "fleetImages",
  "fitnessCert",
  "insurance",
  "bluebook",
  "routePermit",
]);

const SECTION_REVIEW_KEYS = Object.freeze([
  "vehicleDetails",
  "seatLayout",
  "routeSetup",
]);

const FLEET_REVIEW_KEYS = Object.freeze([
  ...DOCUMENT_REVIEW_KEYS,
  ...SECTION_REVIEW_KEYS,
]);

const REVIEW_DECISIONS = Object.freeze(["APPROVED", "REJECTED"]);

module.exports = {
  DOCUMENT_REVIEW_KEYS,
  SECTION_REVIEW_KEYS,
  FLEET_REVIEW_KEYS,
  REVIEW_DECISIONS,
};
