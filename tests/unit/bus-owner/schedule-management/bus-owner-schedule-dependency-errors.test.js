"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createBusOwnerScheduleController } = require("../../../../src/modules/bus-owner/schedule-management/bus-owner-schedule.controller");

const mockRes = () => {
  const res = { statusCode: 200, jsonBody: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (data) => { res.jsonBody = data; return res; };
  return res;
};

test("dependency error handling in controller handlers", async (t) => {
  await t.test("plain error with statusCode property is treated as unknown error and returns exact 500 response", async () => {
    const createDepErr = () => {
      const err = new Error("Dependency rejected request");
      err.statusCode = 429;
      return err;
    };

    const failingService = {
      createSchedule: async () => { throw createDepErr(); },
      updateSchedule: async () => { throw createDepErr(); },
      deleteSchedule: async () => { throw createDepErr(); },
      getScheduleById: async () => { throw createDepErr(); },
    };

    const controller = createBusOwnerScheduleController({ service: failingService });

    let res = mockRes();
    await controller.createSchedule({ body: { a: 1 }, userInfo: { id: "1" } }, res);
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.jsonBody, { status: false, message: "Internal Server Error!" });

    res = mockRes();
    await controller.updateSchedule({ body: { ticketId: "1" }, userInfo: { id: "1" } }, res);
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.jsonBody, { status: false, message: "Internal Server Error" });

    res = mockRes();
    await controller.deleteSchedule({ body: { ticketId: "1" }, userInfo: { id: "1" } }, res);
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.jsonBody, { status: false, message: "Internal Server Error" });

    res = mockRes();
    await controller.getScheduleById({ body: { ticketId: "1" }, userInfo: { id: "1" } }, res);
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.jsonBody, { status: false, message: "Internal Server Error." });
  });
});
