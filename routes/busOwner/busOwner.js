const express = require("express");
const router = express.Router();
const auth = require("../../middleware/authMiddleware.js");
const verifyRoleFromDB = require("../../middleware/verifyRoleFromDB.js");
const { busOwnerMiddleware } = require("../../middleware/checkRole.js");
const requireApprovedBusOwner = require("../../middleware/requireApprovedBusOwner.js");
const { rejectOversizedDriverUpload, driverUploadRateLimiter, parseDriverLicenseUpload } = require("../../middleware/driverLicenseUpload");
const {
  rejectOversizedKycRequest,
  kycSubmissionRateLimiter,
  parseKycSubmissionUpload,
} = require("../../middleware/kycSubmissionUpload.js");
const busOwnerKyc = require("../../src/modules/bus-owner/kyc-submission");
const kycDocumentRead = require("../../src/modules/bus-owner/kyc-document-read");
const fleetManagement = require("../../src/modules/bus-owner/fleet-management");
const boardingPointManagement = require("../../src/modules/bus-owner/boarding-point-management");
const boardingLocationAssignment = require("../../src/modules/bus-owner/boarding-location-assignment");
const amenityManagement = require("../../src/modules/bus-owner/amenity-management");
const operatorRouteConfig = require("../../src/modules/bus-owner/operator-route-configuration");
const busOwnerRouteCon = require("../../controllers/busOwnerController/busOwnerRouteController.js");
const tripCon = require("../../controllers/busOwnerController/busTripController.js");
const settlementCon = require("../../controllers/busOwnerController/settlementController.js");
const fareRuleCon = require("../../controllers/busOwnerController/fareRuleController.js");
const {
  registerBusOwnerSeatLayoutV3Routes,
  registerBusOwnerSeatLayoutV3OperationalRoutes,
} = require("./seatLayoutV3Routes.js");
// ── Pipeline: JWT verify → DB status check → role check ─────────────────────
// Applied to ALL routes in this router — no individual `auth` needed.
router.use(auth, verifyRoleFromDB, busOwnerMiddleware);
// Frontend Read Routes & Compatibility Aliases (profile, kyc-status)
const {
  registerBusOwnerUnapprovedReadRoutes,
  registerBusOwnerApprovedFleetRoutes,
} = require("./frontendReadRoutes.js");
registerBusOwnerUnapprovedReadRoutes(router);

router.post(
  "/submitBusOwnerKyc",
  kycSubmissionRateLimiter,
  rejectOversizedKycRequest,
  parseKycSubmissionUpload,
  busOwnerKyc.submitBusOwnerKyc
);
router.get("/kycDocumentView", kycDocumentRead.viewKycDocument);

const { busOwnerFleetDocumentController } = require("../../src/modules/fleet/document-lifecycle");
// Fleets (draft creation, detail, update, delete, and submission endpoints)
registerBusOwnerApprovedFleetRoutes(router, { fleetManagement });
// Fleet Document Lifecycle (draft document upload & read-url)
router.put("/fleets/:fleetId/documents/:slot", busOwnerFleetDocumentController.uploadDocument);
router.get("/fleets/:fleetId/documents/:slot/read-url", busOwnerFleetDocumentController.getDocumentReadUrl);
router.get("/fleets/:fleetId/documents/:slot/view", busOwnerFleetDocumentController.viewDocument);
registerBusOwnerSeatLayoutV3Routes(router);
// Owner-scoped operator brands (draft-safe)
const ownerBrand = require("../../src/modules/bus-owner/brand");
router.get("/brands", ownerBrand.listBrands);
// Canonical route discovery is draft-safe so an owner can prepare every bus
// before KYC approval. Only verified, active platform geography is exposed.
const fleetRouteSetup = require("../../src/modules/bus-owner/fleet-route-setup");
router.get("/fleet-route-setup/stops", fleetRouteSetup.searchStops);
router.get("/fleet-route-setup/options", fleetRouteSetup.listRouteOptions);
router.get("/fleet-route-setup/boarding-locations", fleetRouteSetup.listBoardingLocations);
router.get("/fleet-route-setup/reusable", fleetRouteSetup.getReusableSetup);
router.get("/fleets/:fleetId/route-setup", fleetRouteSetup.getRouteSetup);
router.put("/fleets/:fleetId/route-setup", fleetRouteSetup.saveRouteSetup);
// ── REQUIRE APPROVED KYC FOR OPERATIONAL ROUTES BELOW ─────────────────────────
router.use(requireApprovedBusOwner);
// Trip-specific seat pricing and availability are operational actions and require approved KYC.
registerBusOwnerSeatLayoutV3OperationalRoutes(router);
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

router.get("/operator-config/variants", operatorRouteConfig.getAvailableVariants);
router.get("/operator-config/:brandId", operatorRouteConfig.getOperatorConfigs);
router.get("/operator-config/:brandId/variant/:variantId/stops", operatorRouteConfig.getVariantStopsWithConfig);
router.get("/operator-config/:brandId/variant/:variantId/return-stops", operatorRouteConfig.getReturnVariantStops);
router.get("/operator-config/:brandId/variant/:variantId/patterns", operatorRouteConfig.listPatternsForVariant);
router.post("/operator-config", operatorRouteConfig.upsertOperatorConfig);
router.patch("/operator-config/:configId", operatorRouteConfig.updateConfig);
// Amenities
router.post("/createAmenity", amenityManagement.createAmenity);
router.get("/amenities/available", amenityManagement.getAvailableAmenities);
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
const crewInviteRateLimit = require("../../middleware/busOwnerCrewInviteRateLimit");
router.post("/assignConductor",   crewInviteRateLimit, staffCon.assignConductor);
router.post("/assignDriver",      crewInviteRateLimit, driverUploadRateLimiter, rejectOversizedDriverUpload, parseDriverLicenseUpload, staffCon.assignDriver);
router.delete("/removeConductor", staffCon.removeConductor);
router.delete("/removeDriver",    staffCon.removeDriver);
router.get("/crew", staffCon.listCrew);
router.patch("/crew/:role/:profileId/status", staffCon.updateCrewStatus);
router.put("/conductors/:profileId/trips/:tripId", staffCon.assignConductorTrip);
router.delete("/conductors/:profileId/trips/:tripId", staffCon.removeConductorTrip);
// Ticket Agents — identity creation, code lookup and brand assignment.
// Registered here, below requireApprovedBusOwner (line 73), so every agent route
// inherits it: only an approved operator may mint or hire an agent.
const { registerBusOwnerAgentRoutes } = require("./agentRoutes.js");
registerBusOwnerAgentRoutes(router);

module.exports = router;
