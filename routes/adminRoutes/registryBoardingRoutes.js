"use strict";

const express = require("express");
const adminMiddleware = require("../../middleware/adminMiddleware.js");
const registry = require("../../src/modules/admin/platform-registry");

const router = express.Router();
router.use(adminMiddleware);

// Transitional legacy endpoints.
router.post("/boarding-points", registry.createBoardingPoint);
router.get("/boarding-points/:stopCode", registry.getBoardingPointsByStop);
router.patch("/boarding-points/:id", registry.updateBoardingPoint);
router.delete("/boarding-points/:id", registry.deleteRegistryBoardingPoint);

// Canonical physical boarding-location registry.
router.post("/boarding-locations", registry.createBoardingLocation);
router.get("/boarding-locations", registry.listBoardingLocations);
router.get("/boarding-locations/nearby", registry.getNearbyBoardingLocations);
router.get("/boarding-locations/:id", registry.getBoardingLocation);
router.patch("/boarding-locations/:id", registry.updateBoardingLocation);
router.patch("/boarding-locations/:id/deactivate", registry.deactivateBoardingLocation);
router.get("/boarding-locations/:id/operator-access", registry.listBoardingLocationOperatorAccess);
router.put("/boarding-locations/:id/operator-access", registry.enableBoardingLocationOperatorAccess);

router.get("/operator-boarding-assignments", registry.listBoardingAssignmentReviews);
router.patch("/operator-boarding-assignments/:id/review", registry.reviewBoardingAssignment);

module.exports = router;
