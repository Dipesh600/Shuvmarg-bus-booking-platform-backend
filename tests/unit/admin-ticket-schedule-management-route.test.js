"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const BusRoute = require("../../models/busRouteModel");
const read = require(
  "../../src/modules/admin/ticket-schedule-management/bus-route-read.controller"
);
const write = require(
  "../../src/modules/admin/ticket-schedule-management/bus-route-write.controller"
);

function patch(t, object, key, value) {
  const original = object[key];
  object[key] = value;
  t.after(() => { object[key] = original; });
}

function res() {
  return {
    code: 200, body: null,
    status(value) { this.code = value; return this; },
    json(value) { this.body = value; return this; },
  };
}

test("route creation preserves validation and legacy schema mismatch",
  async (t) => {
  const invalid = res();
  await write.createRoute({ body: {}, adminInfo: { id: "a1" } }, invalid);
  assert.equal(invalid.code, 400);
  assert.match(invalid.body.message, /Route name, from city/);

  patch(t, console, "error", () => {});
  const output = res();
  await write.createRoute({
    adminInfo: { id: "a1" },
    body: {
      routeName: "R", fromCity: "A", toCity: "B",
      distance: 10, basePrice: 50, userId: "u1",
    },
  }, output);
  assert.equal(output.code, 500);
  assert.equal(output.body.message, "Internal Server Error!");
  assert.match(output.body.error, /Path `from` is required/);
  assert.match(output.body.error, /Path `to` is required/);
  });

test("route listing preserves order and response", async (t) => {
  let sort;
  patch(t, BusRoute, "find", () => ({
    sort(value) {
      sort = value;
      return Promise.resolve([{ _id: "r1" }]);
    },
  }));
  const output = res();
  await read.getAllRoutes({}, output);
  assert.deepEqual(sort, { createdAt: -1 });
  assert.deepEqual(output.body, {
    status: true, message: "All routes fetched successfully!",
    results: 1, data: [{ _id: "r1" }],
  });
});

test("route update preserves validators and not-found response", async (t) => {
  let captured;
  patch(t, BusRoute, "findByIdAndUpdate", async (...args) => {
    captured = args;
    return null;
  });
  const output = res();
  await write.updateRoute({
    params: { id: "r1" }, body: { basePrice: 70 },
  }, output);
  assert.deepEqual(captured, [
    "r1", { basePrice: 70 }, { new: true, runValidators: true },
  ]);
  assert.equal(output.code, 404);
  assert.equal(output.body.message, "Route not found!");
});

test("route status toggles and persists", async (t) => {
  let saved = false;
  const route = {
    status: "ACTIVE",
    async save() { saved = true; },
  };
  patch(t, BusRoute, "findById", async () => route);
  const output = res();
  await write.toggleRouteStatus({ params: { id: "r1" } }, output);
  assert.equal(route.status, "INACTIVE");
  assert.equal(saved, true);
  assert.equal(
    output.body.message,
    "Route status changed to INACTIVE successfully!"
  );
});
