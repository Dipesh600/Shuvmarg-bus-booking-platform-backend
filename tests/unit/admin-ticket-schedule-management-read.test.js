"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Schedule = require("../../models/busScheduleModel");
const read = require(
  "../../src/modules/admin/ticket-schedule-management/" +
  "ticket-schedule-read.controller"
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

test("admin ticket listing remains unscoped", async (t) => {
  let filter;
  patch(t, Schedule, "find", async (value) => {
    filter = value;
    return [{ _id: "s1" }];
  });
  const output = res();
  await read.getAllTickets({
    adminInfo: { id: "admin" },
    userInfo: { id: "operator" },
  }, output);
  assert.deepEqual(filter, {});
  assert.deepEqual(output.body, {
    status: true, message: "Tickets fetched successfully!",
    results: 1, data: [{ _id: "s1" }],
  });
});

test("non-admin ticket listing remains operator scoped", async (t) => {
  let filter;
  patch(t, Schedule, "find", async (value) => {
    filter = value;
    return [];
  });
  const output = res();
  await read.getAllTickets({ userInfo: { id: "operator" } }, output);
  assert.deepEqual(filter, { operatorId: "operator" });
  assert.equal(output.code, 404);
  assert.deepEqual(output.body, {
    status: false, message: "No tickets found.",
  });
});

test("schedule lookup preserves population and response", async (t) => {
  const populated = [];
  patch(t, Schedule, "findById", () => ({
    populate(value) {
      populated.push(value);
      return populated.length === 2
        ? Promise.resolve({ _id: "s1" })
        : this;
    },
  }));
  const output = res();
  await read.getTicketById({ params: { id: "s1" } }, output);
  assert.deepEqual(populated, ["busId", "busRouteId"]);
  assert.equal(output.code, 200);
  assert.equal(output.body.message, "Bus schedule fetched successfully!");
});
