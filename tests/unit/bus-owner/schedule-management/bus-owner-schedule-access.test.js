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

const makeDoc = (opId = "op-100") => ({
  _id: "sch-1",
  operatorId: { toString: () => opId },
  bussName: "Express",
});

test("getScheduleById and deleteSchedule service and controller", async (t) => {
  await t.test("getScheduleById 404, 403, 200 and 500 contract", async () => {
    const targetDoc = makeDoc("op-100");
    let repoCall = null;
    const service = createBusOwnerScheduleService({
      repository: {
        findScheduleById: async (id) => {
          repoCall = id;
          if (id === "missing") return null;
          if (id === "foreign") return makeDoc("other-op");
          if (id === "fail") throw new Error("DB Error");
          return targetDoc;
        },
      },
    });
    const controller = createBusOwnerScheduleController({ service });

    // Not found
    let res = mockRes();
    await controller.getScheduleById({ body: { ticketId: "missing" }, userInfo }, res);
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.jsonBody, { status: false, message: "Ticket not found." });

    // Forbidden
    res = mockRes();
    await controller.getScheduleById({ body: { ticketId: "foreign" }, userInfo }, res);
    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.jsonBody, { status: false, message: "Unauthorized to get ticket!" });

    // Success
    res = mockRes();
    await controller.getScheduleById({ body: { ticketId: "sch-1" }, userInfo }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.jsonBody, {
      status: true,
      message: "Ticket fetched successfully!",
      data: targetDoc,
    });

    // 500 (note final period)
    res = mockRes();
    await controller.getScheduleById({ body: { ticketId: "fail" }, userInfo }, res);
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.jsonBody, { status: false, message: "Internal Server Error." });
  });

  await t.test("deleteSchedule 404, 403, 200 and 500 contract", async () => {
    let deletedId = null;
    let imageServiceCalled = false;
    const service = createBusOwnerScheduleService({
      repository: {
        findScheduleById: async (id) => {
          if (id === "missing") return null;
          if (id === "foreign") return makeDoc("other-op");
          if (id === "fail") throw new Error("DB Error");
          return makeDoc("op-100");
        },
        deleteScheduleById: async (id) => { deletedId = id; },
      },
      imageService: {
        uploadThumbnail: async () => { imageServiceCalled = true; },
      },
    });
    const controller = createBusOwnerScheduleController({ service });

    // Not found
    let res = mockRes();
    await controller.deleteSchedule({ body: { ticketId: "missing" }, userInfo }, res);
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.jsonBody, { status: false, message: "Ticket not found." });
    assert.equal(deletedId, null);

    // Forbidden
    res = mockRes();
    await controller.deleteSchedule({ body: { ticketId: "foreign" }, userInfo }, res);
    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.jsonBody, { status: false, message: "Unauthorized to delete this ticket." });
    assert.equal(deletedId, null);

    // Success
    res = mockRes();
    await controller.deleteSchedule({ body: { ticketId: "sch-1" }, userInfo }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.jsonBody, { status: true, message: "Ticket deleted successfully!" });
    assert.equal(deletedId, "sch-1");
    assert.equal(imageServiceCalled, false);

    // 500 (no period/exclamation mark)
    res = mockRes();
    await controller.deleteSchedule({ body: { ticketId: "fail" }, userInfo }, res);
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.jsonBody, { status: false, message: "Internal Server Error" });
  });
});
