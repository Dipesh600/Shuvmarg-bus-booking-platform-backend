"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Stop = require("../../models/stopModel.js");
const RouteStop = require("../../models/routeStopModel.js");
const BoardingPoint = require("../../models/boardingPointsModel.js");
const BoardingLocation = require("../../models/boardingLocationModel.js");
const OperatorConfig = require("../../models/operatorRouteConfigModel.js");
const service = require(
  "../../src/modules/admin/platform-registry/stop-registry.service.js"
);

function patch(t, object, key, value) {
  const original = object[key];
  object[key] = value;
  t.after(() => { object[key] = original; });
}

test("stop registry creates explicit and generated stop codes", async (t) => {
  const created = [];
  let generated;
  patch(t, Stop, "findOne", async () => null);
  patch(t, Stop, "create", async (data) => { created.push(data); return data; });
  patch(t, Stop, "createWithUniqueCode", async (data) => {
    generated = data;
    return data;
  });

  const mapSelection = {
    coordinates: { lat: 27.7172, lng: 85.324 },
    coordinateSource: "GOOGLE_PLACE",
    coordinateProvider: "GOOGLE",
    coordinatePlaceId: "google-place-1",
  };
  await service.createStop({ code: "ktm", name: "Kathmandu", ...mapSelection });
  await service.createStop({ name: "Pokhara", ...mapSelection });
  assert.equal(created[0].code, "ktm");
  assert.equal(created[0].status, "ACTIVE");
  assert.equal(created[0].coordinateSource, "GOOGLE_PLACE");
  assert.equal(created[0].coordinatePlaceId, "google-place-1");
  assert.equal(Object.hasOwn(generated, "code"), false);
});

test("interactive stop creation requires a map-selected position", async () => {
  await assert.rejects(service.createStop({ name: "Missing map" }), {
    code: "STOP_MAP_LOCATION_REQUIRED",
  });
  await assert.rejects(service.createStop({
    name: "Typed coordinates",
    coordinates: { lat: 27.7, lng: 85.3 },
  }), { code: "INVALID_STOP_COORDINATE_SOURCE" });
});

test("map-based coordinate updates retain capture provenance", async (t) => {
  const saved = { saveCalls: 0 };
  const stop = { save: async () => { saved.saveCalls += 1; } };
  patch(t, Stop, "findById", async () => stop);

  await service.updateStop("507f1f77bcf86cd799439011", {
    coordinates: { lat: 27.693, lng: 85.281 },
    coordinateSource: "MAP_PIN",
    coordinateProvider: "GOOGLE",
    coordinateSuggestedAddress: "Kalanki, Kathmandu, Nepal",
  });

  assert.deepEqual(stop.coordinates, { lat: 27.693, lng: 85.281 });
  assert.equal(stop.coordinateSource, "MAP_PIN");
  assert.equal(stop.coordinateProvider, "GOOGLE");
  assert.equal(stop.coordinateSuggestedAddress, "Kalanki, Kathmandu, Nepal");
  assert.equal(saved.saveCalls, 1);
});

test("stop registry blocks referenced deletion before any write", async (t) => {
  let writes = 0;
  const objectId = new (require("mongoose").Types.ObjectId)();
  patch(t, Stop, "findById", async () => ({ _id: objectId }));
  patch(t, OperatorConfig, "countDocuments", async () => 2);
  patch(t, RouteStop, "countDocuments", async () => 0);
  patch(t, BoardingPoint, "countDocuments", async () => 0);
  patch(t, BoardingLocation, "countDocuments", async () => 0);
  patch(t, Stop, "findByIdAndDelete", async () => { writes += 1; });

  await assert.rejects(
    service.deleteStop(objectId),
    /Stop is actively used and cannot be deleted/
  );
  assert.equal(writes, 0);
});

test("stop registry cascades an unreferenced deletion in order", async (t) => {
  const calls = [];
  const objectId = new (require("mongoose").Types.ObjectId)();
  patch(t, Stop, "findById", async () => ({ _id: objectId }));
  patch(t, OperatorConfig, "countDocuments", async () => 0);
  patch(t, RouteStop, "countDocuments", async () => 0);
  patch(t, BoardingPoint, "countDocuments", async () => 0);
  patch(t, BoardingLocation, "countDocuments", async () => 0);
  patch(t, Stop, "findByIdAndDelete", async () => calls.push("stop"));

  await service.deleteStop(objectId);
  assert.deepEqual(calls, ["stop"]);
});

test("active boarding locations block route-stop deactivation", async (t) => {
  patch(t, OperatorConfig, "countDocuments", async () => 0);
  patch(t, RouteStop, "countDocuments", async () => 0);
  patch(t, BoardingPoint, "countDocuments", async () => 0);
  patch(t, BoardingLocation, "countDocuments", async () => 1);

  await assert.rejects(
    service.updateStop("507f1f77bcf86cd799439011", { status: "INACTIVE" }),
    {
      code: "STOP_IN_USE",
      details: {
        operatorRouteCount: 0, routeStopCount: 0,
        boardingPointCount: 0, boardingLocationCount: 1,
      },
    }
  );
});
