"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const OperatorBrand = require("../../../models/operatorBrandModel.js");
const BoardingLocation = require("../../../models/boardingLocationModel.js");
const Assignment = require("../../../models/operatorBoardingAssignmentModel.js");
const OperatorRouteConfig = require("../../../models/operatorRouteConfigModel.js");
const service = require(
  "../../../src/modules/bus-owner/boarding-location-assignment/boarding-assignment.service.js"
);
const { createBoardingAssignmentController } = require(
  "../../../src/modules/bus-owner/boarding-location-assignment/boarding-location-assignment.controller.js"
);

const ownerId = "507f1f77bcf86cd799439011";
const brandId = "507f1f77bcf86cd799439012";
const locationId = "507f1f77bcf86cd799439013";

function patch(t, object, key, replacement) {
  const original = object[key];
  object[key] = replacement;
  t.after(() => { object[key] = original; });
}

function lean(value) { return { async lean() { return value; } }; }

test("operator reuses a verified canonical location without duplicating it", async (t) => {
  patch(t, OperatorBrand, "findOne", () => lean({ _id: brandId, status: "ACTIVE" }));
  patch(t, BoardingLocation, "findOne", () => lean({
    _id: locationId, stopId: "507f1f77bcf86cd799439014",
    status: "ACTIVE", verificationStatus: "VERIFIED",
  }));
  patch(t, OperatorRouteConfig, "exists", async () => ({ _id: "config-1" }));
  let payload;
  patch(t, Assignment, "create", async (value) => {
    payload = value;
    return {
      _id: "assignment-1", ...value,
      async populate() {
        this.boardingLocationId = {
          _id: locationId, stopId: "stop-1", name: "Kalanki Chowk",
          status: "ACTIVE", verificationStatus: "VERIFIED",
        };
      },
    };
  });
  const result = await service.createBoardingAssignment(ownerId, {
    brandId, boardingLocationId: locationId, usage: "PICKUP",
  });
  assert.equal(payload.status, "ACTIVE");
  assert.equal(payload.usage, "PICKUP");
  assert.equal(result.boardingLocation.name, "Kalanki Chowk");
});

test("operator cannot assign an unavailable canonical location", async (t) => {
  patch(t, OperatorBrand, "findOne", () => lean({ _id: brandId, status: "ACTIVE" }));
  patch(t, BoardingLocation, "findOne", () => lean(null));
  await assert.rejects(
    service.createBoardingAssignment(ownerId, { brandId, boardingLocationId: locationId }),
    { code: "BOARDING_LOCATION_UNAVAILABLE" }
  );
});

test("operator cannot assign a location outside its active route stops", async (t) => {
  patch(t, OperatorBrand, "findOne", () => lean({ _id: brandId, status: "ACTIVE" }));
  patch(t, BoardingLocation, "findOne", () => lean({
    _id: locationId, stopId: "507f1f77bcf86cd799439014",
    status: "ACTIVE", verificationStatus: "VERIFIED",
  }));
  patch(t, OperatorRouteConfig, "exists", async () => null);
  await assert.rejects(
    service.createBoardingAssignment(ownerId, {
      brandId, boardingLocationId: locationId, usage: "PICKUP",
    }),
    { code: "ROUTE_STOP_NOT_SERVED" }
  );
});

test("controller returns stable errors without database details", async () => {
  const handlers = createBoardingAssignmentController({
    async createBoardingAssignment() {
      const error = new Error("E11000 secret collection detail");
      error.code = "BOARDING_ASSIGNMENT_CONFLICT";
      error.statusCode = 409;
      error.message = "This assignment already exists.";
      throw error;
    },
  }, { error() {} });
  const response = {
    statusCode: null, body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  await handlers.createAssignment({ userInfo: { id: ownerId }, body: {} }, response);
  assert.equal(response.statusCode, 409);
  assert.deepEqual(response.body, {
    success: false, errorCode: "BOARDING_ASSIGNMENT_CONFLICT",
    message: "This assignment already exists.",
  });
  assert.doesNotMatch(JSON.stringify(response.body), /E11000/);
});
