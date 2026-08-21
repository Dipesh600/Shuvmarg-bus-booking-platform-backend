"use strict";

const fleetDocumentReviewSchema = require("./fleet-document-review.schema");

module.exports = {
  sectionReviews: {
    vehicleDetails: { type: fleetDocumentReviewSchema, default: () => ({ status: "pending", reason: null }) },
    seatLayout: { type: fleetDocumentReviewSchema, default: () => ({ status: "pending", reason: null }) },
    routeSetup: { type: fleetDocumentReviewSchema, default: () => ({ status: "pending", reason: null }) },
  },
};
