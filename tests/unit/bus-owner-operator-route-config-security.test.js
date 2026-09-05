"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const OperatorBrand = require("../../models/operatorBrandModel.js");
const Bus = require("../../models/fleetModel.js");
const RouteVariant = require("../../models/routeVariantModel.js");
const OperatorRouteConfig = require("../../models/operatorRouteConfigModel.js");
const {
  assertOwnedBrand,
  assertVariantBelongsToApprovedFleetCorridor,
  assertOwnedApprovedFleetForVariant,
  assertConfigBelongsToOwnedBrand,
} = require("../../src/modules/bus-owner/operator-route-configuration/operator-route-configuration.policy.js");

function patch(t, object, key, value) {
  const original = object[key];
  object[key] = value;
  t.after(() => { object[key] = original; });
}

function leanQuery(value) {
  return {
    select() { return this; },
    lean: async () => value,
  };
}

test("bus-owner route configuration is owner and approved-fleet scoped", async (t) => {
  await t.test("owned active brand passes the bus-owner route config gate", async () => {
    patch(t, OperatorBrand, "findOne", (query) => leanQuery({
      _id: query._id,
      ownerId: query.ownerId,
      brandName: "Owner Travels",
      status: "ACTIVE",
    }));

    const brand = await assertOwnedBrand(
      "507f1f77bcf86cd799439020",
      "507f1f77bcf86cd799439021"
    );

    assert.equal(brand.status, "ACTIVE");
  });

  await t.test("foreign route variants are rejected before owner config writes", async () => {
    patch(t, Bus, "distinct", async () => ["507f1f77bcf86cd799439030"]);
    patch(t, RouteVariant, "findById", () => leanQuery({
      _id: "507f1f77bcf86cd799439040",
      corridorId: "507f1f77bcf86cd799439099",
      status: "ACTIVE",
      direction: "FORWARD",
    }));

    await assert.rejects(
      assertVariantBelongsToApprovedFleetCorridor(
        "507f1f77bcf86cd799439021",
        "507f1f77bcf86cd799439040"
      ),
      (error) =>
        error.code === "ROUTE_VARIANT_NOT_ASSIGNED" &&
        error.statusCode === 403
    );
  });

});

test("bus-owner route setup rejects a route path that belongs to another approved bus", async (t) => {
  patch(t, Bus, "findOne", () => leanQuery({
    _id: "507f1f77bcf86cd799439030",
    brandId: "507f1f77bcf86cd799439020",
    ownerId: "507f1f77bcf86cd799439021",
    corridorId: "507f1f77bcf86cd799439031",
    approvalStatus: "APPROVED",
  }));
  patch(t, RouteVariant, "findById", () => leanQuery({
    _id: "507f1f77bcf86cd799439040",
    corridorId: "507f1f77bcf86cd799439099",
    status: "ACTIVE",
    direction: "FORWARD",
  }));

  await assert.rejects(
    assertOwnedApprovedFleetForVariant(
      "507f1f77bcf86cd799439021",
      {
        brandId: "507f1f77bcf86cd799439020",
        fleetId: "507f1f77bcf86cd799439030",
        variantId: "507f1f77bcf86cd799439040",
      }
    ),
    (error) =>
      error.code === "ROUTE_VARIANT_NOT_ASSIGNED_TO_FLEET" &&
      error.statusCode === 403
  );
});

test("bus-owner route setup rejects config reads from another bus", async (t) => {
  patch(t, OperatorRouteConfig, "findById", () => leanQuery({
    _id: "507f1f77bcf86cd799439050",
    brandId: "507f1f77bcf86cd799439020",
    variantId: "507f1f77bcf86cd799439040",
    fleetId: "507f1f77bcf86cd799439030",
    status: "ACTIVE",
  }));
  patch(t, OperatorBrand, "findOne", (query) => leanQuery({
    _id: query._id,
    ownerId: query.ownerId,
    brandName: "Owner Travels",
    status: "ACTIVE",
  }));

  await assert.rejects(
    assertConfigBelongsToOwnedBrand(
      "507f1f77bcf86cd799439021",
      "507f1f77bcf86cd799439050",
      {
        brandId: "507f1f77bcf86cd799439020",
        variantId: "507f1f77bcf86cd799439040",
        fleetId: "507f1f77bcf86cd799439099",
      }
    ),
    (error) =>
      error.code === "ROUTE_CONFIG_FLEET_MISMATCH" &&
      error.statusCode === 403
  );
});
