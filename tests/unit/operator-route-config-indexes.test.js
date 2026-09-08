"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const ensureOperatorRouteConfigFleetScopeIndex = require("../../scripts/ensureOperatorRouteConfigFleetScopeIndex.js");

test("operator route config index migration is fleet scoped and idempotent", async () => {
  const calls = [];
  const collection = {
    async indexes() {
      calls.push(["indexes"]);
      return [{ name: "brandId_1_variantId_1_patternName_1" }];
    },
    async dropIndex(name) {
      calls.push(["dropIndex", name]);
    },
    async createIndex(key, options) {
      calls.push(["createIndex", key, options]);
    },
  };

  const result = await ensureOperatorRouteConfigFleetScopeIndex({
    connection: {
      collection(name) {
        calls.push(["collection", name]);
        return collection;
      },
    },
  });

  assert.deepEqual(result, { success: true, droppedOldIndex: true });
  assert.deepEqual(calls, [
    ["collection", "operatorrouteconfigs"],
    ["indexes"],
    ["dropIndex", "brandId_1_variantId_1_patternName_1"],
    [
      "createIndex",
      { brandId: 1, variantId: 1, fleetId: 1, patternName: 1 },
      { unique: true, name: "brandId_1_variantId_1_fleetId_1_patternName_1" },
    ],
  ]);
});
