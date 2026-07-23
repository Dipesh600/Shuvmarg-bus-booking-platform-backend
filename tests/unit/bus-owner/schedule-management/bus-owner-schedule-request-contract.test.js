"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createBusOwnerScheduleService } = require("../../../../src/modules/bus-owner/schedule-management/bus-owner-schedule.service");
const { createBusOwnerScheduleController } = require("../../../../src/modules/bus-owner/schedule-management/bus-owner-schedule.controller");

const userInfo = { id: "op-100", role: "busOwner" };

const mockRes = () => {
  const res = { statusCode: 200, jsonBody: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (data) => { res.jsonBody = data; return res; };
  return res;
};

const makeSchedule = () => ({
  _id: "sch-1",
  operatorId: { toString: () => "op-100" },
  bussName: "Bus",
});

test("missing request body and missing userInfo contract tests", async (t) => {
  await t.test("missing body on update, delete, and read reaches 500 without calling repository", async () => {
    let repoCalls = [];
    const service = createBusOwnerScheduleService({
      repository: {
        findScheduleById: async (id) => { repoCalls.push(["find", id]); return makeSchedule(); },
        saveSchedule: async () => { repoCalls.push(["save"]); },
        deleteScheduleById: async () => { repoCalls.push(["delete"]); },
      },
    });
    const controller = createBusOwnerScheduleController({ service });

    // Update with undefined body
    let res = mockRes();
    await controller.updateSchedule({ userInfo, body: undefined }, res);
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.jsonBody, { status: false, message: "Internal Server Error" });

    // Delete with undefined body
    res = mockRes();
    await controller.deleteSchedule({ userInfo, body: undefined }, res);
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.jsonBody, { status: false, message: "Internal Server Error" });

    // Read with undefined body
    res = mockRes();
    await controller.getScheduleById({ userInfo, body: undefined }, res);
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.jsonBody, { status: false, message: "Internal Server Error." });

    assert.equal(repoCalls.length, 0);
  });

  await t.test("missing userInfo when schedule exists reaches exact 500 response and does not mutate/delete or return 403", async () => {
    let saveCalled = false;
    let deleteCalled = false;
    const service = createBusOwnerScheduleService({
      repository: {
        findScheduleById: async () => makeSchedule(),
        saveSchedule: async () => { saveCalled = true; },
        deleteScheduleById: async () => { deleteCalled = true; },
      },
    });
    const controller = createBusOwnerScheduleController({ service });

    // Update missing userInfo
    let res = mockRes();
    await controller.updateSchedule({ body: { ticketId: "sch-1" }, userInfo: undefined }, res);
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.jsonBody, { status: false, message: "Internal Server Error" });

    // Delete missing userInfo
    res = mockRes();
    await controller.deleteSchedule({ body: { ticketId: "sch-1" }, userInfo: undefined }, res);
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.jsonBody, { status: false, message: "Internal Server Error" });

    // Read missing userInfo
    res = mockRes();
    await controller.getScheduleById({ body: { ticketId: "sch-1" }, userInfo: undefined }, res);
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.jsonBody, { status: false, message: "Internal Server Error." });

    assert.equal(saveCalled, false);
    assert.equal(deleteCalled, false);
  });
});
