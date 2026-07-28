"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { ScheduleError } = require("../../../../src/modules/bus-owner/schedule-management/bus-owner-schedule.errors");
const { createBusOwnerScheduleController } = require("../../../../src/modules/bus-owner/schedule-management/bus-owner-schedule.controller");

const mockRes = () => {
  const res = { statusCode: 200, jsonBody: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (data) => { res.jsonBody = data; return res; };
  return res;
};

test("ScheduleError class and controller error handling", async (t) => {
  await t.test("ScheduleError sets statusCode and message correctly", () => {
    const err = new ScheduleError(418, "I am a teapot");
    assert.equal(err.statusCode, 418);
    assert.equal(err.message, "I am a teapot");
    assert.ok(err instanceof Error);
  });

  await t.test("controller handles custom ScheduleError and unknown Error distinctly across all methods", async () => {
    const throwingService = {
      createSchedule: async () => { throw new ScheduleError(422, "Custom Error"); },
      updateSchedule: async () => { throw new ScheduleError(409, "Conflict"); },
      deleteSchedule: async () => { throw new ScheduleError(400, "Bad Request"); },
      getScheduleById: async () => { throw new ScheduleError(403, "Forbidden"); },
    };

    const controller = createBusOwnerScheduleController({ service: throwingService });
    const dummyReq = { body: { ticketId: "sch-1" }, userInfo: { id: "1" } };

    let res = mockRes();
    await controller.createSchedule(dummyReq, res);
    assert.equal(res.statusCode, 422);
    assert.deepEqual(res.jsonBody, { status: false, message: "Custom Error" });

    res = mockRes();
    await controller.updateSchedule(dummyReq, res);
    assert.equal(res.statusCode, 409);
    assert.deepEqual(res.jsonBody, { status: false, message: "Conflict" });

    res = mockRes();
    await controller.deleteSchedule(dummyReq, res);
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.jsonBody, { status: false, message: "Bad Request" });

    res = mockRes();
    await controller.getScheduleById(dummyReq, res);
    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.jsonBody, { status: false, message: "Forbidden" });
  });
});
