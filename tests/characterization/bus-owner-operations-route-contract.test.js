"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const router = require("../../routes/busOwner/busOwner");
const auth = require("../../middleware/authMiddleware");
const verifyRoleFromDB = require("../../middleware/verifyRoleFromDB");
const { busOwnerMiddleware } = require("../../middleware/checkRole");
const requireApprovedBusOwner = require("../../middleware/requireApprovedBusOwner");
const kyc = require("../../src/modules/bus-owner/kyc-submission");
const fleet = require("../../src/modules/bus-owner/fleet-management");
const boarding = require("../../src/modules/bus-owner/boarding-point-management");
const boardingLocations = require("../../src/modules/bus-owner/boarding-location-assignment");
const amenities = require("../../src/modules/bus-owner/amenity-management");

test("bus-owner operations route and middleware contract", () => {
  const expected = [
    ["post", "/submitBusOwnerKyc", kyc.submitBusOwnerKyc],
    ["get", "/myBusOwnerKycStatus", kyc.getMyBusOwnerKycStatus],
    ["post", "/submitFleetForVerification", fleet.submitFleetForVerification],
    ["get", "/myFleets", fleet.getMyFleets],
    ["post", "/getFleetById", fleet.getFleetById],
    ["patch", "/updateFleet", fleet.updateFleet],
    ["delete", "/deleteFleet", fleet.deleteFleet],
    ["post", "/createBoardingPoint", boarding.createBoardingPoint],
    ["get", "/getMyBoardingPoints", boarding.getMyBoardingPoints],
    ["patch", "/updateBoardingPoint", boarding.updateBoardingPoint],
    ["delete", "/deleteBoardingPoint", boarding.deleteBoardingPoint],
    ["post", "/getBoardingPointsById", boarding.getBoardingPointsById],
    ["get", "/operator-brands", boardingLocations.listBrands],
    ["get", "/route-stops", boardingLocations.listRouteStops],
    ["get", "/boarding-locations", boardingLocations.listCatalog],
    ["get", "/boarding-assignments", boardingLocations.listAssignments],
    ["post", "/boarding-assignments", boardingLocations.createAssignment],
    ["patch", "/boarding-assignments/:id", boardingLocations.updateAssignment],
    ["post", "/boarding-location-requests", boardingLocations.requestLocation],
    ["post", "/createAmenity", amenities.createAmenity],
    ["get", "/getMyAmenities", amenities.getMyAmenities],
    ["patch", "/updateAmenity", amenities.updateAmenity],
    ["delete", "/deleteAmenity", amenities.deleteAmenity],
    ["post", "/getAmenitiesById", amenities.getAmenityById],
  ];
  const layers = router.stack;
  assert.deepEqual(
    layers.slice(0, 3).map((layer) => layer.handle),
    [auth, verifyRoleFromDB, busOwnerMiddleware]
  );
  const approvalIndex = layers.findIndex(
    (layer) => layer.handle === requireApprovedBusOwner
  );
  for (const [method, path, handler] of expected) {
    const matches = layers.filter(
      (layer) => layer.route?.path === path && layer.route.methods[method]
    );
    assert.equal(matches.length, 1, `${method.toUpperCase()} ${path}`);
    assert.deepEqual(matches[0].route.stack.map((item) => item.handle), [handler]);
    const index = layers.indexOf(matches[0]);
    if (path.includes("Kyc") || path.includes("KycStatus")) {
      assert.ok(index < approvalIndex);
    } else {
      assert.ok(index > approvalIndex);
    }
  }
});
