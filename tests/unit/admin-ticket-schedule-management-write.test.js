"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Seats = require("../../models/seatsModel");
const Schedule = require("../../models/busScheduleModel");
const creation = require(
  "../../src/modules/admin/ticket-schedule-management/" +
  "ticket-schedule-creation.service"
);
const write = require(
  "../../src/modules/admin/ticket-schedule-management/" +
  "ticket-schedule-write.controller"
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

const valid = {
  busId: "b", routeId: "r", seatTemplateId: "t",
  departureTime: "8", arrivalTime: "9", date: "d",
  totalTimeTaken: "1h", shift: "morning",
};

test("create schedule preserves routeId fallback and response", async (t) => {
  let passed;
  patch(t, creation, "createSchedule", async (input, adminId) => {
    passed = { input, adminId };
    return { schedule: "schedule", seats: "seats" };
  });
  const output = res();
  await write.createTicket({
    body: valid, adminInfo: { id: "admin" },
  }, output);
  assert.equal(passed.input.busRouteId, "r");
  assert.equal(passed.adminId, "admin");
  assert.equal(output.code, 201);
  assert.deepEqual(output.body.data, {
    schedule: "schedule", seats: "seats",
  });
});

test("create schedule preserves required-fields and duplicate contracts",
  async (t) => {
    const missing = res();
    await write.createTicket({ body: {}, adminInfo: {} }, missing);
    assert.equal(missing.code, 400);
    assert.match(missing.body.message, /Missing required fields/);

    patch(t, creation, "createSchedule", async () => {
      const error = new Error("duplicate");
      error.code = 11000;
      throw error;
    });
    const duplicate = res();
    await write.createTicket({
      body: valid, adminInfo: { id: "admin" },
    }, duplicate);
    assert.equal(duplicate.code, 400);
    assert.equal(
      duplicate.body.message,
      "A schedule already exists for this bus on the selected date."
    );
  });

test("schedule update preserves validator options", async (t) => {
  let args;
  patch(t, Schedule, "findByIdAndUpdate", async (...values) => {
    args = values;
    return { _id: "s1" };
  });
  const output = res();
  await write.updateTicket({
    params: { id: "s1" }, body: { shift: "evening" },
  }, output);
  assert.deepEqual(args, [
    "s1", { shift: "evening" }, { new: true, runValidators: true },
  ]);
  assert.equal(output.body.message, "Bus schedule updated successfully!");
});

test("schedule status toggles and persists", async (t) => {
  let saved = false;
  const schedule = {
    isActive: true,
    async save() { saved = true; },
  };
  patch(t, Schedule, "findById", async () => schedule);
  const output = res();
  await write.updateTicketStatus({ params: { id: "s1" } }, output);
  assert.equal(schedule.isActive, false);
  assert.equal(saved, true);
  assert.equal(
    output.body.message,
    "Bus schedule status changed to INACTIVE successfully!"
  );
});

test("schedule deletion preserves seat-first order and response", async (t) => {
  const calls = [];
  patch(t, Seats, "deleteMany", async (filter) => {
    calls.push(["seats", filter]);
  });
  patch(t, Schedule, "findByIdAndDelete", async (id) => {
    calls.push(["schedule", id]);
    return { _id: id };
  });
  const output = res();
  await write.deleteTicket({ params: { id: "s1" } }, output);
  assert.deepEqual(calls, [
    ["seats", { scheduleId: "s1" }],
    ["schedule", "s1"],
  ]);
  assert.equal(
    output.body.message,
    "Bus schedule and associated seats deleted successfully!"
  );
});
