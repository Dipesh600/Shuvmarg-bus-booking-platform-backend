"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const OperatorBrand = require("../../models/operatorBrandModel.js");
const Bus = require("../../models/fleetModel.js");
const RouteVariant = require("../../models/routeVariantModel.js");
const configuration = require("../../src/modules/admin/operator-route-configuration/configuration.service.js");
const {
  createBusOwnerOperatorRouteConfigController,
} = require("../../src/modules/bus-owner/operator-route-configuration/operator-route-configuration.controller.js");

function patch(t, object, key, value) {
  const original = object[key];
  object[key] = value;
  t.after(() => { object[key] = original; });
}

function leanQuery(value) {
  return { select() { return this; }, lean: async () => value };
}

function mockResponse() {
  return {
    statusCode: null,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

test("bus-owner route setup reports stale route-config index repair instead of generic failure", async (t) => {
  patch(t, OperatorBrand, "findOne", (query) => leanQuery({
    _id: query._id, ownerId: query.ownerId, brandName: "Owner Travels", status: "ACTIVE",
  }));
  patch(t, Bus, "findOne", () => leanQuery({
    _id: "507f1f77bcf86cd799439030",
    brandId: "507f1f77bcf86cd799439020",
    ownerId: "507f1f77bcf86cd799439021",
    corridorId: "507f1f77bcf86cd799439031",
    approvalStatus: "APPROVED",
  }));
  patch(t, RouteVariant, "findById", () => leanQuery({
    _id: "507f1f77bcf86cd799439040",
    corridorId: "507f1f77bcf86cd799439031",
    status: "ACTIVE",
    direction: "FORWARD",
  }));
  patch(t, configuration, "upsertOperatorConfig", async () => {
    const error = new Error("E11000 duplicate key error");
    error.code = 11000;
    error.keyPattern = { brandId: 1, variantId: 1, patternName: 1 };
    throw error;
  });

  const controller = createBusOwnerOperatorRouteConfigController({ logger: { error() {} } });
  const res = mockResponse();
  await controller.upsertOperatorConfig({
    userInfo: { id: "507f1f77bcf86cd799439021" },
    body: {
      brandId: "507f1f77bcf86cd799439020",
      fleetId: "507f1f77bcf86cd799439030",
      variantId: "507f1f77bcf86cd799439040",
      patternName: "Standard",
      status: "ACTIVE",
      activeStops: ["507f1f77bcf86cd799439060", "507f1f77bcf86cd799439061"],
      boardingConfig: [],
      timingConfig: [],
    },
  }, res);

  assert.equal(res.statusCode, 409);
  assert.equal(res.payload.errorCode, "ROUTE_CONFIG_INDEX_REPAIR_REQUIRED");
  assert.match(res.payload.message, /one-time repair/i);
});

test("bus-owner route setup rejects custom service names before saving", async (t) => {
  patch(t, OperatorBrand, "findOne", (query) => leanQuery({
    _id: query._id, ownerId: query.ownerId, brandName: "Owner Travels", status: "ACTIVE",
  }));
  patch(t, Bus, "findOne", () => leanQuery({
    _id: "507f1f77bcf86cd799439030",
    brandId: "507f1f77bcf86cd799439020",
    ownerId: "507f1f77bcf86cd799439021",
    corridorId: "507f1f77bcf86cd799439031",
    approvalStatus: "APPROVED",
  }));
  patch(t, RouteVariant, "findById", () => leanQuery({
    _id: "507f1f77bcf86cd799439040",
    corridorId: "507f1f77bcf86cd799439031",
    status: "ACTIVE",
    direction: "FORWARD",
  }));
  patch(t, configuration, "upsertOperatorConfig", async () => {
    throw new Error("save should not run for invalid service type");
  });

  const controller = createBusOwnerOperatorRouteConfigController({ logger: { error() {} } });
  const res = mockResponse();
  await controller.upsertOperatorConfig({
    userInfo: { id: "507f1f77bcf86cd799439021" },
    body: {
      brandId: "507f1f77bcf86cd799439020",
      fleetId: "507f1f77bcf86cd799439030",
      variantId: "507f1f77bcf86cd799439040",
      patternName: "Super Fast Custom",
      status: "ACTIVE",
      activeStops: ["507f1f77bcf86cd799439060", "507f1f77bcf86cd799439061"],
      boardingConfig: [],
      timingConfig: [],
    },
  }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.payload.errorCode, "INVALID_ROUTE_SERVICE_TYPE");
  assert.match(res.payload.message, /valid service type/i);
});
