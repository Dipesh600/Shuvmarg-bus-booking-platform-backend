"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const OperatorRouteConfig = require("../../models/operatorRouteConfigModel.js");
const {
  resolveRoutePattern,
} = require("../../src/modules/admin/schedule-management/schedule-route-pattern.service.js");

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

test("schedule route pattern lookup is scoped to the exact bus", async (t) => {
  let explicitQuery = null;
  patch(t, OperatorRouteConfig, "findOne", (query) => {
    explicitQuery = query;
    return leanQuery({
      _id: "config-1",
      brandId: "brand-1",
      variantId: "variant-1",
      fleetId: "fleet-1",
      patternName: "Standard",
    });
  });

  const result = await resolveRoutePattern({
    operatorRouteConfigId: "config-1",
    brandId: "brand-1",
    busId: "fleet-1",
    variantId: "variant-1",
  });

  assert.equal(result, "config-1");
  assert.equal(explicitQuery.fleetId, undefined);
  assert.equal(explicitQuery.brandId, "brand-1");
  assert.equal(explicitQuery.status, "ACTIVE");
});

test("admin brand template is copied into the exact bus before scheduling", async (t) => {
  let materializeQuery = null;
  patch(t, OperatorRouteConfig, "findOne", () => leanQuery({
    _id: "template-1",
    brandId: "brand-1",
    variantId: "variant-1",
    fleetId: null,
    patternName: "Standard",
    status: "ACTIVE",
    activeStops: ["stop-1", "stop-2"],
  }));
  patch(t, OperatorRouteConfig, "findOneAndUpdate", (query) => {
    materializeQuery = query;
    return leanQuery({ _id: "fleet-config-1" });
  });

  const result = await resolveRoutePattern({
    operatorRouteConfigId: "template-1",
    brandId: "brand-1",
    busId: "fleet-1",
    variantId: "variant-1",
  });

  assert.equal(result, "fleet-config-1");
  assert.equal(materializeQuery.fleetId, "fleet-1");
  assert.equal(materializeQuery.patternName, "Standard");
});

test("default route pattern lookup does not reuse another bus setup", async (t) => {
  let defaultQuery = null;
  let fallbackQuery = null;

  patch(t, OperatorRouteConfig, "findOne", (query) => {
    defaultQuery = query;
    return leanQuery(null);
  });
  patch(t, OperatorRouteConfig, "find", (query) => {
    fallbackQuery = query;
    return leanQuery([{ _id: "config-2", patternName: "Standard", fleetId: "fleet-2" }]);
  });

  const result = await resolveRoutePattern({
    brandId: "brand-1",
    busId: "fleet-2",
    variantId: "variant-1",
  });

  assert.equal(result, "config-2");
  assert.equal(defaultQuery.fleetId, "fleet-2");
  assert.equal(defaultQuery.variantId, "variant-1");
  assert.equal(fallbackQuery.fleetId, "fleet-2");
  assert.equal(fallbackQuery.variantId, "variant-1");
});
