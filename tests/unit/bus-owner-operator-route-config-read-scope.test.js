"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const OperatorBrand = require("../../models/operatorBrandModel.js");
const OperatorRouteConfig = require("../../models/operatorRouteConfigModel.js");
const {
  assertConfigBelongsToOwnedBrand,
} = require("../../src/modules/bus-owner/operator-route-configuration/operator-route-configuration.policy.js");

function patch(t, object, key, value) {
  const original = object[key];
  object[key] = value;
  t.after(() => { object[key] = original; });
}

function leanQuery(value) {
  return { select() { return this; }, lean: async () => value };
}

test("bus-owner route configId reads cannot cross into another brand or variant", async (t) => {
  patch(t, OperatorRouteConfig, "findById", () => leanQuery({
    _id: "507f1f77bcf86cd799439050",
    brandId: "507f1f77bcf86cd799439021",
    variantId: "507f1f77bcf86cd799439040",
    status: "ACTIVE",
  }));
  patch(t, OperatorBrand, "findOne", (query) => leanQuery({
    _id: query._id, ownerId: query.ownerId, brandName: "Owner Travels", status: "ACTIVE",
  }));

  await assert.rejects(
    assertConfigBelongsToOwnedBrand("507f1f77bcf86cd799439020", "507f1f77bcf86cd799439050", {
      brandId: "507f1f77bcf86cd799439099",
      variantId: "507f1f77bcf86cd799439040",
    }),
    (error) => error.code === "ROUTE_CONFIG_BRAND_MISMATCH" && error.statusCode === 403
  );
});
