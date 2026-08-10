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
    populate() { return this; },
    select() { return { lean: async () => value }; },
    lean: async () => value,
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
  };
}

function operationalStop(_id, code, parentStopId) {
  return {
    _id, code, parentStopId, status: "ACTIVE",
    verificationStatus: "VERIFIED", isRouteStop: true,
  };
}

function prepareValidSequence(t, { previousRows = [], insertMany } = {}) {
  patch(t, Variant, "findById", () => query({
    _id: "v1", name: "Via Highway", status: "DRAFT", direction: "FORWARD",
    corridorId: { originId: "parent-origin", destinationId: "parent-destination" },
  }));
  const stops = {
    ORIGIN: operationalStop("origin", "ORIGIN", "parent-origin"),
    DEST: operationalStop("destination", "DEST", "parent-destination"),
    "parent-origin": { _id: "parent-origin", status: "ACTIVE", isRouteStop: false },
    "parent-destination": { _id: "parent-destination", status: "ACTIVE", isRouteStop: false },
  };
  stops.origin = stops.ORIGIN;
  stops.destination = stops.DEST;
  patch(t, Stop, "find", async () => [stops.ORIGIN, stops.DEST]);
  patch(t, Stop, "findById", (id) => query(stops[String(id)] || null));
  patch(t, RouteStop, "find", () => query(previousRows));
  const deletes = [];
  patch(t, RouteStop, "deleteMany", async (filter) => deletes.push(filter));
  const inserts = [];
  patch(t, RouteStop, "insertMany", insertMany || (async (rows) => {
    inserts.push(rows);
    return rows;
  }));
  return { deletes, inserts };
}

test("validates the complete sequence before replacing persisted route stops", async (t) => {
  const { deletes, inserts } = prepareValidSequence(t);
  const result = await service.setVariantStops("v1", [
    { stopCode: "DEST", sequence: 2, estimatedMinutesFromOrigin: 240 },
    { stopCode: "origin", sequence: 1, estimatedMinutesFromOrigin: 0 },
  ]);
  assert.equal(deletes.length, 1);
  assert.equal(inserts.length, 1);
  assert.deepEqual(result, inserts[0]);
  assert.deepEqual(result.map((row) => row.stopId), ["origin", "destination"]);
  assert.equal(result[1].durationFromOriginMins, 240);
});

test("rejects unknown or ineligible stops before touching the existing sequence", async (t) => {
  let deleted = false;
  patch(t, Variant, "findById", () => query({ _id: "v1" }));
  patch(t, Stop, "find", async () => [operationalStop("origin", "ORIGIN")]);
  patch(t, RouteStop, "deleteMany", async () => { deleted = true; });
  await assert.rejects(
    service.setVariantStops("v1", [
      { stopCode: "ORIGIN", sequence: 1 }, { stopCode: "MISSING", sequence: 2 },
    ]),
    (error) => error.code === "ROUTE_STOP_NOT_FOUND"
  );
  assert.equal(deleted, false);

  patch(t, Stop, "find", async () => [
    operationalStop("origin", "ORIGIN"),
    { ...operationalStop("destination", "DEST"), verificationStatus: "PENDING" },
  ]);
  await assert.rejects(
    service.setVariantStops("v1", [
      { stopCode: "ORIGIN", sequence: 1 }, { stopCode: "DEST", sequence: 2 },
    ]),
    (error) => error.code === "INVALID_ROUTE_STOP"
  );
  assert.equal(deleted, false);
});

test("rejects duplicate, non-consecutive, and backwards timing before replacement", async (t) => {
  const { deletes } = prepareValidSequence(t);
  await assert.rejects(
    service.setVariantStops("v1", [
      { stopCode: "ORIGIN", sequence: 1 }, { stopCode: "origin", sequence: 2 },
    ]),
    (error) => error.code === "DUPLICATE_ROUTE_STOP"
  );
  await assert.rejects(
    service.setVariantStops("v1", [
      { stopCode: "ORIGIN", sequence: 1, estimatedMinutesFromOrigin: 20 },
      { stopCode: "DEST", sequence: 3, estimatedMinutesFromOrigin: 10 },
    ]),
    (error) => error.code === "INVALID_ROUTE_STOP_SEQUENCE"
  );
  assert.equal(deletes.length, 0);
});

test("restores the previous sequence when a non-transactional replacement fails", async (t) => {
  const previousRows = [{ _id: "old", variantId: "v1", stopId: "old-stop", sequence: 1 }];
  const writes = [];
  const { deletes } = prepareValidSequence(t, {
    previousRows,
    insertMany: async (rows) => {
      writes.push(rows);
      if (writes.length === 1) throw new Error("write failed");
      return rows;
    },
  });
  await assert.rejects(
    service.setVariantStops("v1", [
      { stopCode: "ORIGIN", sequence: 1 }, { stopCode: "DEST", sequence: 2 },
    ]),
    /write failed/
  );
  assert.equal(deletes.length, 2);
  assert.deepEqual(writes[1], previousRows);
});
