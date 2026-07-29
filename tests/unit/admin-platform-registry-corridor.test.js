"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Stop = require("../../models/stopModel.js");
const Corridor = require("../../models/routeCorridorModel.js");
const Variant = require("../../models/routeVariantModel.js");
const RouteStop = require("../../models/routeStopModel.js");
const Bus = require("../../models/fleetModel.js");
const service = require(
  "../../src/modules/admin/platform-registry/corridor-registry.service.js"
);

function patch(t, object, key, value) {
  const original = object[key];
  object[key] = value;
  t.after(() => { object[key] = original; });
}

test("corridor creation preserves lookup order and persistence fields", async (t) => {
  const stopQueries = [];
  const corridorQueries = [];
  let payload;
  patch(t, Stop, "findOne", async ({ code }) => {
    stopQueries.push(code);
    return code === "KTM"
      ? { _id: "s1", code, name: "Kathmandu" }
      : { _id: "s2", code, name: "Pokhara" };
  });
  patch(t, Corridor, "findOne", async (query) => {
    corridorQueries.push(query);
    return null;
  });
  patch(t, Corridor, "create", async (data) => { payload = data; return data; });

  await service.createCorridor({
    originCode: "ktm", destinationCode: "pkr", notes: "primary",
  }, "admin-1");
  assert.deepEqual(stopQueries, ["KTM", "PKR"]);
  assert.deepEqual(corridorQueries, [
    { originId: "s1", destinationId: "s2" },
    { originId: "s2", destinationId: "s1" },
  ]);
  assert.deepEqual(payload, {
    code: "KTM-PKR", originId: "s1", destinationId: "s2",
    isSymmetric: true, notes: "primary", createdBy: "admin-1",
  });
});

test("corridor deletion blocks fleet references before cascades", async (t) => {
  let variantsQueried = false;
  patch(t, Corridor, "findById", async () => ({ _id: "c1" }));
  patch(t, Bus, "countDocuments", async () => 4);
  patch(t, Variant, "find", async () => { variantsQueried = true; return []; });

  await assert.rejects(
    service.deleteCorridor("c1"),
    /REFERENCED:4:4 fleet\(s\) are assigned/
  );
  assert.equal(variantsQueried, false);
});

test("corridor deletion blocks saved stop sequences", async (t) => {
  patch(t, Corridor, "findById", async () => ({ _id: "c1" }));
  patch(t, Bus, "countDocuments", async () => 0);
  patch(t, Variant, "find", async () => [{ _id: "v1" }]);
  patch(t, RouteStop, "countDocuments", async () => 3);

  await assert.rejects(
    service.deleteCorridor("c1"),
    /REFERENCED:3:Corridor has variants with stop sequences/
  );
});
