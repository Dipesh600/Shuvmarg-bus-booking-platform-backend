const express = require("express");
const router = express.Router();
const auth = require("../../middleware/authMiddleware.js");
const verifyRoleFromDB = require("../../middleware/verifyRoleFromDB.js");
const { busOwnerMiddleware } = require("../../middleware/checkRole.js");
const requireApprovedBusOwner = require("../../middleware/requireApprovedBusOwner.js");
const busOwnerKyc = require("../../src/modules/bus-owner/kyc-submission");
const kycDocumentRead = require("../../src/modules/bus-owner/kyc-document-read");
const fleetManagement = require("../../src/modules/bus-owner/fleet-management");
const boardingPointManagement = require("../../src/modules/bus-owner/boarding-point-management");
const boardingLocationAssignment = require("../../src/modules/bus-owner/boarding-location-assignment");
const amenityManagement = require("../../src/modules/bus-owner/amenity-management");
const busOwnerRouteCon = require("../../controllers/busOwnerController/busOwnerRouteController.js");
const tripCon = require("../../controllers/busOwnerController/busTripController.js");
const settlementCon = require("../../controllers/busOwnerController/settlementController.js");
const fareRuleCon = require("../../controllers/busOwnerController/fareRuleController.js");

// ── Pipeline: JWT verify → DB status check → role check ─────────────────────
// Applied to ALL routes in this router — no individual `auth` needed.
router.use(auth, verifyRoleFromDB, busOwnerMiddleware);

// Frontend Read Routes & Compatibility Aliases (profile, kyc-status)
const {
  registerBusOwnerUnapprovedReadRoutes,
  registerBusOwnerApprovedFleetRoutes,
} = require("./frontendReadRoutes.js");
registerBusOwnerUnapprovedReadRoutes(router);

router.post("/submitBusOwnerKyc", busOwnerKyc.submitBusOwnerKyc);
router.get("/kycDocumentReadUrl", kycDocumentRead.getKycDocumentReadUrl);

const { busOwnerFleetDocumentController } = require("../../src/modules/fleet/document-lifecycle");

// Fleets (draft creation, detail, update, delete, and submission endpoints)
registerBusOwnerApprovedFleetRoutes(router, { fleetManagement });

// Fleet Document Lifecycle (draft document upload & read-url)
router.put("/fleets/:fleetId/documents/:slot", busOwnerFleetDocumentController.uploadDocument);
router.get("/fleets/:fleetId/documents/:slot/read-url", busOwnerFleetDocumentController.getDocumentReadUrl);

// ── REQUIRE APPROVED KYC FOR OPERATIONAL ROUTES BELOW ─────────────────────────
router.use(requireApprovedBusOwner);

// Boarding Points
router.post("/createBoardingPoint", boardingPointManagement.createBoardingPoint);
router.get("/getMyBoardingPoints", boardingPointManagement.getMyBoardingPoints);
router.patch("/updateBoardingPoint", boardingPointManagement.updateBoardingPoint);
router.delete("/deleteBoardingPoint", boardingPointManagement.deleteBoardingPoint);
router.post("/getBoardingPointsById", boardingPointManagement.getBoardingPointsById);

// Canonical boarding locations and operator-owned usage assignments.
// Legacy Boarding Point endpoints remain available during the data migration.
router.get("/operator-brands", boardingLocationAssignment.listBrands);
router.get("/route-stops", boardingLocationAssignment.listRouteStops);
router.get("/boarding-locations", boardingLocationAssignment.listCatalog);
router.get("/boarding-assignments", boardingLocationAssignment.listAssignments);
router.post("/boarding-assignments", boardingLocationAssignment.createAssignment);
router.patch("/boarding-assignments/:id", boardingLocationAssignment.updateAssignment);
router.post("/boarding-location-requests", boardingLocationAssignment.requestLocation);

// Amenities
router.post("/createAmenity", amenityManagement.createAmenity);
router.get("/getMyAmenities", amenityManagement.getMyAmenities);
router.patch("/updateAmenity", amenityManagement.updateAmenity);
router.delete("/deleteAmenity", amenityManagement.deleteAmenity);
router.post("/getAmenitiesById", amenityManagement.getAmenityById);

// Routes for Route CRUD
router.post("/createRoute", busOwnerRouteCon.createRoute);
router.get("/getMyRoutes", busOwnerRouteCon.getMyRoutes);
router.post("/getRouteById", busOwnerRouteCon.getRouteById);
router.patch("/updateRoute", busOwnerRouteCon.updateRoute);
router.delete("/deleteRoute", busOwnerRouteCon.deleteRoute);

// Trips CRUD
router.post("/createTrip", tripCon.createTrip);
router.get("/getMyTrips", tripCon.getMyTrips);
router.post("/getTripById", tripCon.getTripById);
router.patch("/updateTripStatus", tripCon.updateTripStatus);
router.patch("/toggleTripStatus", tripCon.toggleTripStatus);
router.delete("/deleteTrip", tripCon.deleteTrip);

// Settlements
router.post("/raiseSettlement", settlementCon.raiseSettlement);
router.get("/getMySettlements", settlementCon.getMySettlements);
router.patch("/markSettlementReceived", settlementCon.markSettlementReceived);

// Fare Rules (Dynamic Pricing)
router.post("/upsertFareRule", fareRuleCon.upsertFareRule);
router.get("/getMyFareRules", fareRuleCon.getMyFareRules);
router.delete("/deleteFareRule", fareRuleCon.deleteFareRule);

// Staff Assignment (Conductors & Drivers)
const staffCon = require("../../controllers/busOwnerController/staffAssignmentController.js");
router.post("/assignConductor",   staffCon.assignConductor);
router.post("/assignDriver",      staffCon.assignDriver);
router.delete("/removeConductor", staffCon.removeConductor);
router.delete("/removeDriver",    staffCon.removeDriver);

module.exports = router;
