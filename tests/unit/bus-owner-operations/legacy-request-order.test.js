"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createFleetManagementController,
} = require("../../../src/modules/bus-owner/fleet-management/fleet-management.controller");
const {
  createBoardingPointController,
} = require("../../../src/modules/bus-owner/boarding-point-management/boarding-point.controller");
const {
  createAmenityManagementController,
} = require("../../../src/modules/bus-owner/amenity-management/amenity-management.controller");

function response() {
  let status;
  let body;
  return {
    status(value) { status = value; return this; },
    json(value) { body = value; return this; },
    result: () => ({ status, body }),
  };
}

test("legacy missing-body ordering remains unchanged", async () => {
  let called = false;
  const fail = async () => { called = true; };
  const logger = { error() {} };
  const groups = [
    [
      createFleetManagementController({
        fleetService: {
          getFleetDetails: fail, updateFleetDetails: fail, removeFleet: fail,
        },
        logger,
      }),
      [["getFleetById", 400], ["updateFleet", 400], ["deleteFleet", 400]],
    ],
    [
      createBoardingPointController({
        boardingPointService: {
          updateBoardingPoints: fail,
          deleteBoardingPoint: fail,
          getBoardingPointById: fail,
        },
        logger,
      }),
      [
        ["updateBoardingPoint", 400],
        ["deleteBoardingPoint", 500],
        ["getBoardingPointsById", 500],
      ],
    ],
    [
      createAmenityManagementController({
        amenityService: {
          updateAmenity: fail, deleteAmenity: fail, getAmenityById: fail,
        },
        logger,
      }),
      [["updateAmenity", 400], ["deleteAmenity", 500], ["getAmenityById", 500]],
    ],
  ];
  for (const [handlers, cases] of groups) {
    for (const [name, status] of cases) {
      const res = response();
      await handlers[name]({ userInfo: { id: "owner" } }, res);
      assert.equal(res.result().status, status, name);
      assert.equal(res.result().body.success, false);
    }
  }
  assert.equal(called, false);
});
