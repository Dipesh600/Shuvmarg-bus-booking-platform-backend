const express = require("express");
const router = express.Router();
const auth = require("../../middleware/authMiddleware.js");
const verifyRoleFromDB = require("../../middleware/verifyRoleFromDB.js");
const { busOwnerMiddleware } = require("../../middleware/checkRole.js");
const busOwnerCon = require("../../controllers/busOwnerController/busOwnerController.js");
const busOwnerRouteCon = require("../../controllers/busOwnerController/busOwnerRouteController.js");
const tripCon = require("../../controllers/busOwnerController/busTripController.js");
const settlementCon = require("../../controllers/busOwnerController/settlementController.js");
const fareRuleCon = require("../../controllers/busOwnerController/fareRuleController.js");

// ── Pipeline: JWT verify → DB status check → role check ─────────────────────
// Applied to ALL routes in this router — no individual `auth` needed.
router.use(auth, verifyRoleFromDB, busOwnerMiddleware);

router.post("/submitBusOwnerKyc", busOwnerCon.submitBusOwnerKyc);
router.get("/myBusOwnerKycStatus", busOwnerCon.getMyBusOwnerKycStatus);
router.post("/submitFleetForVerification", busOwnerCon.submitFleetForVerification);
router.get("/myFleets", busOwnerCon.getMyFleets);
router.post("/getFleetById", busOwnerCon.getFleetById);
router.patch("/updateFleet", busOwnerCon.updateFleet);
router.delete("/deleteFleet", busOwnerCon.deleteFleet);

// Boarding Points
router.post("/createBoardingPoint", busOwnerCon.createBoardingPoint);
router.get("/getMyBoardingPoints", busOwnerCon.getMyBoardingPoints);
router.patch("/updateBoardingPoint", busOwnerCon.updateBoardingPoint);
router.delete("/deleteBoardingPoint", busOwnerCon.deleteBoardingPoint);   
router.post("/getBoardingPointsById", busOwnerCon.getBoardingPointsById);   

// Amenities
router.post("/createAmenity", busOwnerCon.createAmenity);
router.get("/getMyAmenities", busOwnerCon.getMyAmenities);
router.patch("/updateAmenity", busOwnerCon.updateAmenity);
router.delete("/deleteAmenity", busOwnerCon.deleteAmenity);
router.post("/getAmenitiesById", busOwnerCon.getAmenityById);

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