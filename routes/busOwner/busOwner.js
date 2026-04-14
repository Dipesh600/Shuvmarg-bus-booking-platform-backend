const express = require("express");
const router = express.Router();
const auth = require("../../middleware/authMiddleware.js");
const { busOwnerMiddleware } = require("../../middleware/checkRole.js");
const busOwnerCon = require("../../controllers/busOwnerController/busOwnerController.js");
const busOwnerRouteCon = require("../../controllers/busOwnerController/busOwnerRouteController.js");
const tripCon = require("../../controllers/busOwnerController/busTripController.js");
const settlementCon = require("../../controllers/busOwnerController/settlementController.js");
const fareRuleCon = require("../../controllers/busOwnerController/fareRuleController.js");

router.post("/submitBusOwnerKyc", auth, busOwnerMiddleware, busOwnerCon.submitBusOwnerKyc);
router.get("/myBusOwnerKycStatus", auth, busOwnerMiddleware, busOwnerCon.getMyBusOwnerKycStatus);
router.post("/submitFleetForVerification", auth, busOwnerMiddleware, busOwnerCon.submitFleetForVerification);
router.get("/myFleets", auth, busOwnerMiddleware, busOwnerCon.getMyFleets);
router.post("/getFleetById", auth, busOwnerMiddleware, busOwnerCon.getFleetById);
router.patch("/updateFleet", auth, busOwnerMiddleware, busOwnerCon.updateFleet);
router.delete("/deleteFleet", auth, busOwnerMiddleware, busOwnerCon.deleteFleet);

// Boarding Points
router.post("/createBoardingPoint", auth, busOwnerMiddleware, busOwnerCon.createBoardingPoint);
router.get("/getMyBoardingPoints", auth, busOwnerMiddleware, busOwnerCon.getMyBoardingPoints);
router.patch("/updateBoardingPoint", auth, busOwnerMiddleware, busOwnerCon.updateBoardingPoint);
router.delete("/deleteBoardingPoint", auth, busOwnerMiddleware, busOwnerCon.deleteBoardingPoint);   
router.post("/getBoardingPointsById", auth, busOwnerMiddleware, busOwnerCon.getBoardingPointsById);   

// Amenities
router.post("/createAmenity", auth, busOwnerMiddleware, busOwnerCon.createAmenity);
router.get("/getMyAmenities", auth, busOwnerMiddleware, busOwnerCon.getMyAmenities);
router.patch("/updateAmenity", auth, busOwnerMiddleware, busOwnerCon.updateAmenity);
router.delete("/deleteAmenity", auth, busOwnerMiddleware, busOwnerCon.deleteAmenity);
router.post("/getAmenitiesById", auth, busOwnerMiddleware, busOwnerCon.getAmenityById);

// Routes for Route CRUD
router.post("/createRoute", auth, busOwnerMiddleware, busOwnerRouteCon.createRoute);
router.get("/getMyRoutes", auth, busOwnerMiddleware, busOwnerRouteCon.getMyRoutes);
router.post("/getRouteById", auth, busOwnerMiddleware, busOwnerRouteCon.getRouteById);
router.patch("/updateRoute", auth, busOwnerMiddleware, busOwnerRouteCon.updateRoute);
router.delete("/deleteRoute", auth, busOwnerMiddleware, busOwnerRouteCon.deleteRoute);

// Trips CRUD
router.post("/createTrip", auth, busOwnerMiddleware, tripCon.createTrip);
router.get("/getMyTrips", auth, busOwnerMiddleware, tripCon.getMyTrips);
router.post("/getTripById", auth, busOwnerMiddleware, tripCon.getTripById);
router.patch("/updateTripStatus", auth, busOwnerMiddleware, tripCon.updateTripStatus);
router.patch("/toggleTripStatus", auth, busOwnerMiddleware, tripCon.toggleTripStatus);
router.delete("/deleteTrip", auth, busOwnerMiddleware, tripCon.deleteTrip);

// Settlements
router.post("/raiseSettlement", auth, busOwnerMiddleware, settlementCon.raiseSettlement);
router.get("/getMySettlements", auth, busOwnerMiddleware, settlementCon.getMySettlements);
router.patch("/markSettlementReceived", auth, busOwnerMiddleware, settlementCon.markSettlementReceived);

// Fare Rules (Dynamic Pricing)
router.post("/upsertFareRule", auth, busOwnerMiddleware, fareRuleCon.upsertFareRule);
router.get("/getMyFareRules", auth, busOwnerMiddleware, fareRuleCon.getMyFareRules);
router.delete("/deleteFareRule", auth, busOwnerMiddleware, fareRuleCon.deleteFareRule);

module.exports = router;