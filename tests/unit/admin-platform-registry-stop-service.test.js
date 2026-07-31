"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Stop = require("../../models/stopModel.js");
const RouteStop = require("../../models/routeStopModel.js");
const BoardingPoint = require("../../models/boardingPointsModel.js");
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

  await service.createStop({ code: "ktm", name: "Kathmandu" });
  await service.createStop({ name: "Pokhara" });
  assert.equal(created[0].code, "ktm");
  assert.equal(created[0].status, "ACTIVE");
  assert.equal(Object.hasOwn(generated, "code"), false);
});

test("stop registry blocks referenced deletion before any write", async (t) => {
  let writes = 0;
  const objectId = new (require("mongoose").Types.ObjectId)();
  patch(t, Stop, "findById", async () => ({ _id: objectId }));
  patch(t, OperatorConfig, "countDocuments", async () => 2);
  patch(t, RouteStop, "countDocuments", async () => 0);
  patch(t, BoardingPoint, "countDocuments", async () => 0);
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
  patch(t, Stop, "findByIdAndDelete", async () => calls.push("stop"));

  await service.deleteStop(objectId);
  assert.deepEqual(calls, ["stop"]);
});
