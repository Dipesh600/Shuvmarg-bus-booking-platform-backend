"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const RouteCorridor = require("../../models/routeCorridorModel.js");
const RouteVariant = require("../../models/routeVariantModel.js");
const { allocateVariantCode } = require(
  "../../src/modules/admin/platform-registry/variant-code-allocation.service.js"
);
const { buildVariantCodeAllocationReport } = require(
  "../../tools/preflight-route-variant-code-allocation.js"
);
const { buildCounterBackfillWrites } = require(
  "../../tools/migrate-route-variant-code-sequences.js"
);

test("code allocation atomically skips preexisting legacy codes when a counter was not backfilled", async () => {
  let sequence = 0;
  const updates = [];
  const code = await allocateVariantCode("corridor-1", "FORWARD", {
    RouteCorridorModel: {
      findOneAndUpdate(filter, update) {
        updates.push({ filter, update });
        sequence += 1;
        return { select() { return { lean: async () => ({ code: "KTM-MLW", variantSequence: sequence }) }; } };
      },
    },
    RouteVariantModel: {
      exists: async ({ code: candidate }) => candidate === "KTM-MLW-V01-F" ? { _id: "existing" } : null,
    },
  });
  assert.equal(code, "KTM-MLW-V02-F");
  assert.equal(updates.length, 2);
  assert.deepEqual(updates[0].update, [{
    $set: { variantSequence: { $add: [{ $ifNull: ["$variantSequence", 0] }, 1] } },
  }]);
});

test("code-allocation preflight plans monotonic backfills without treating legacy reads as writes", async () => {
  const report = buildVariantCodeAllocationReport([
    { _id: "corridor-1", code: "KTM-MLW" },
    { _id: "corridor-2", code: "PKR-KTM", variantSequence: 5 },
  ], [
    { _id: "variant-1", corridorId: "corridor-1", code: "KTM-MLW-V01-F" },
    { _id: "variant-2", corridorId: "corridor-1", code: "KTM-MLW-V04-R" },
    { _id: "variant-3", corridorId: "corridor-2", code: "legacy-custom-code" },
  ]);
  assert.equal(report.requiresBackfill, true);
  assert.deepEqual(report.counterUpdates, [{
    corridorId: "corridor-1", corridorCode: "KTM-MLW", currentSequence: null,
    observedMaximum: 4, targetSequence: 4,
  }]);
  assert.equal(report.unrecognizedVariantCodes.length, 1);
  assert.deepEqual(buildCounterBackfillWrites(report.counterUpdates), [{
    updateOne: {
      filter: { _id: "corridor-1" },
      update: { $max: { variantSequence: 4 } },
    },
  }]);
});

test("new discovery-sourced corridors are rejected while legacy discovery records remain queryable", async () => {
  const { resolveWritableCorridorSource } = require(
    "../../src/modules/admin/platform-registry/corridor/corridor-source.policy.js"
  );
  const { buildCorridorQuery } = require(
    "../../src/modules/admin/platform-registry/corridor/corridor-query.service.js"
  );
  assert.equal(resolveWritableCorridorSource("admin"), "ADMIN");
  assert.throws(
    () => resolveWritableCorridorSource("DISCOVERY"),
    (error) => error.code === "DISCOVERY_CORRIDOR_RETIRED"
  );
  assert.deepEqual(await buildCorridorQuery({ source: "DISCOVERY" }), { source: "DISCOVERY" });
  const legacyWrite = new RouteCorridor({
    code: "KTM-MLW", originId: "64b7ab47c9c77f9387000001",
    destinationId: "64b7ab47c9c77f9387000002", source: "DISCOVERY",
  });
  await assert.rejects(
    legacyWrite.validate(),
    /DISCOVERY is retired and cannot be used for new corridors/
  );
});

test("variant code model remains unique and existing variants remain readable", () => {
  assert.equal(RouteVariant.schema.path("code").options.unique, true);
  assert.ok(RouteCorridor.schema.path("variantSequence"));
});
