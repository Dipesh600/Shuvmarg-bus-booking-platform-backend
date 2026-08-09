"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Stop = require("../../models/stopModel.js");
const RouteStop = require("../../models/routeStopModel.js");
const Variant = require("../../models/routeVariantModel.js");
const service = require(
  "../../src/modules/admin/platform-registry/route-stop-sequence.service.js"
);

function patch(t, object, key, value) {
  const original = object[key];
  object[key] = value;
  t.after(() => { object[key] = original; });
}

function query(value) {
  return {
    populate: async () => value,
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
  };
}

test("setting a variant sequence never overwrites its linked counterpart", async (t) => {
  const deletes = [];
  const inserts = [];
  patch(t, Variant, "findById", () => query({ _id: "v1" }));
  patch(t, Stop, "find", async () => [
    { _id: "s1", code: "KTM" },
    { _id: "s2", code: "PKR" },
  ]);
  patch(t, RouteStop, "deleteMany", async (filter) => deletes.push(filter));
  patch(t, RouteStop, "insertMany", async (rows) => {
    inserts.push(rows);
    return rows;
  });

  const result = await service.setVariantStops("v1", [
    { stopCode: "KTM", sequence: 1, estimatedMinutesFromOrigin: 0 },
    { stopCode: "PKR", sequence: 2, estimatedMinutesFromOrigin: 240 },
  ]);
  assert.deepEqual(deletes, [{ variantId: "v1" }]);
  assert.equal(result, inserts[0]);
  assert.equal(inserts.length, 1);
});

test("unknown stops fail before replacing an existing sequence", async (t) => {
  let deleted = false;
  patch(t, Variant, "findById", () => query({ _id: "v1" }));
  patch(t, Stop, "find", async () => [{ _id: "s1", code: "KTM" }]);
  patch(t, RouteStop, "deleteMany", async () => { deleted = true; });

  await assert.rejects(
    service.setVariantStops("v1", [
      { stopCode: "KTM", sequence: 1 },
      { stopCode: "MISSING", sequence: 2 },
    ]),
    /Stops not found in registry: MISSING/
  );
  assert.equal(deleted, false);
});
