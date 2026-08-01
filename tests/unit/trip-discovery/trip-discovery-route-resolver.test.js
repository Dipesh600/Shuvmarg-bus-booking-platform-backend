const { test } = require("node:test");
const assert = require("node:assert");
const { createRouteResolver } = require("../../../src/modules/trip-discovery/trip-discovery-route-resolver");

test("Trip Discovery Route Resolver", async (t) => {
  // Mock repository with expected interface
  const mockRepo = {
    findLegacyRoutes: async () => [],
    findStopsByNameOrCode: async (regex) => {
      if (regex.test("cityA")) return [{ _id: "stop1", name: "cityA" }];
      if (regex.test("cityB")) return [{ _id: "stop3", name: "cityB" }];
      return [];
    },
    findCorridors: async (originIds, destIds) => {
      if (originIds.includes("stop1") && destIds.includes("stop3")) {
        return { fwdCorridors: [{ _id: "corridor1" }], revCorridors: [] };
      }
      return { fwdCorridors: [], revCorridors: [] };
    },
    findVariants: async (fwdCorridorIds) => {
      if (fwdCorridorIds.includes("corridor1")) {
        return { fwdVariants: [{ _id: "var1" }], revVariants: [] };
      }
      return { fwdVariants: [], revVariants: [] };
    },
    findRouteStops: async (originIds, destIds) => {
      if (originIds.includes("stop1") && destIds.includes("stop3")) {
        return {
          originRouteStops: [{ stopId: "stop1", variantId: "var1", sequence: 1, isMajor: true }],
          destRouteStops: [{ stopId: "stop3", variantId: "var1", sequence: 10, isMajor: true, estimatedMinutesFromOrigin: 100 }]
        };
      }
      return { originRouteStops: [], destRouteStops: [] };
    }
  };

  await t.test("lookup by from/to IDs returns all combinations", async () => {
    const { resolveRouteCandidates } = createRouteResolver({ repository: mockRepo });
    const result = await resolveRouteCandidates("cityA", "cityB");
    assert.deepStrictEqual(result.variantIds, ["var1"]);
    assert.strictEqual(result.resolvedFromName, "cityA");
    assert.strictEqual(result.selectedOriginStopId, "stop1");
    assert.strictEqual(result.selectedDestinationStopId, "stop3");
  });

  await t.test("missing from/to returns empty arrays", async () => {
    const { resolveRouteCandidates } = createRouteResolver({ repository: mockRepo });
    const res1 = await resolveRouteCandidates(null, "cityB");
    assert.deepStrictEqual(res1.variantIds, []);

    const res2 = await resolveRouteCandidates("cityA", null);
    assert.deepStrictEqual(res2.variantIds, []);
  });

  await t.test("null inputs return empty arrays", async () => {
    const { resolveRouteCandidates } = createRouteResolver({ repository: mockRepo });
    const res = await resolveRouteCandidates(null, null);
    assert.deepStrictEqual(res.variantIds, []);
  });

  await t.test("empty combinations return empty arrays", async () => {
    const { resolveRouteCandidates } = createRouteResolver({ repository: mockRepo });
    const res = await resolveRouteCandidates("cityX", "cityY");
    assert.deepStrictEqual(res.variantIds, []);
  });
});
