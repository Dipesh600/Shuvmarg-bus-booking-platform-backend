"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createBusOwnerScheduleService } = require("../../../../src/modules/bus-owner/schedule-management/bus-owner-schedule.service");
const { createBusOwnerScheduleController } = require("../../../../src/modules/bus-owner/schedule-management/bus-owner-schedule.controller");

const userInfo = { id: "op-100", role: "busOwner" };
const mockRes = () => {
  const res = { statusCode: 200, jsonBody: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (d) => { res.jsonBody = d; return res; };
  return res;
};

const makeScheduleDoc = (o = {}) => ({
  _id: "sch-100", operatorId: { toString: () => "op-100" },
  operatorName: "Old Op", bussName: "Old Bus", vehicleType: "Old Type",
  departureTime: "06:00 AM", arrivalTime: "01:00 PM", bussNo: "BA 1 PA 0000",
  date: "2025-01-01", route: { from: "Pokhara", to: "Kathmandu" },
  price: 500, yatrapoints: 50, totalSeats: 30, totalTimeTaken: "7 hours",
  shift: "Morning", boardingPoints: ["Stop A"], amenities: ["AC"],
  routeId: "r-1", thumbnail: "http://old.jpg",
  ...o,
});

test("updateSchedule service and controller", async (t) => {
  await t.test("missing or foreign operator handling", async () => {
    let service = createBusOwnerScheduleService({ repository: { findScheduleById: async () => null } });
    let controller = createBusOwnerScheduleController({ service });
    let res = mockRes();
    await controller.updateSchedule({ body: { ticketId: "m" }, userInfo }, res);
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.jsonBody, {
      status: false,
      message: "Ticket not found.",
    });

    const doc = makeScheduleDoc({ operatorId: { toString: () => "other" } });
    let saveCalled = false;
    service = createBusOwnerScheduleService({ repository: { findScheduleById: async () => doc, saveSchedule: async () => { saveCalled = true; } } });
    controller = createBusOwnerScheduleController({ service });
    res = mockRes();
    await controller.updateSchedule({ body: { ticketId: "sch-100" }, userInfo }, res);
    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.jsonBody, {
      status: false,
      message: "Unauthorized to update this ticket.",
    });
    assert.equal(saveCalled, false);
  });

  await t.test("full field update, exact response and document identity preservation", async () => {
    const originalDoc = makeScheduleDoc();
    let saveCount = 0, uploadCount = 0;
    const savedResult = { different: true };
    const service = createBusOwnerScheduleService({
      repository: { findScheduleById: async () => originalDoc, saveSchedule: async () => { saveCount++; return savedResult; } },
      imageService: { uploadThumbnail: async () => { uploadCount++; return "http://new.jpg"; } },
    });
    const controller = createBusOwnerScheduleController({ service });
    const res = mockRes();

    const body = {
      ticketId: "sch-100", operatorName: "New Operator", bussName: "New Bus",
      vehicleType: "Deluxe", departureTime: "08:00 AM", arrivalTime: "03:00 PM",
      date: "2026-08-01", from: "Kathmandu", to: "Pokhara", price: 1200,
      totalSeats: 40, bussNo: "BA 2 KHA 1234", totalTimeTaken: "8 hours",
      shift: "Day", boardingPoints: [], routeId: "should-not-change", amenities: ["WiFi", "TV"],
    };
    await controller.updateSchedule({ body, userInfo, files: { thumbnail: {} } }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.jsonBody, { status: true, message: "Ticket updated successfully!", data: originalDoc });
    assert.equal(res.jsonBody.data, originalDoc);
    assert.notEqual(res.jsonBody.data, savedResult);
    assert.equal(originalDoc.operatorName, "New Operator");
    assert.equal(originalDoc.bussName, "New Bus");
    assert.equal(originalDoc.vehicleType, "Deluxe");
    assert.equal(originalDoc.departureTime, "08:00 AM");
    assert.equal(originalDoc.arrivalTime, "03:00 PM");
    assert.equal(originalDoc.date, "2026-08-01");
    assert.deepEqual(originalDoc.route, { from: "Kathmandu", to: "Pokhara" });
    assert.equal(originalDoc.price, 1200);
    assert.equal(originalDoc.yatrapoints, 120);
    assert.equal(originalDoc.totalSeats, 40);
    assert.equal(originalDoc.bussNo, "BA 2 KHA 1234");
    assert.equal(originalDoc.totalTimeTaken, "8 hours");
    assert.equal(originalDoc.shift, "Day");
    assert.deepEqual(originalDoc.boardingPoints, []);
    assert.equal(originalDoc.thumbnail, "http://new.jpg");
    assert.equal(originalDoc.routeId, "r-1");
    assert.deepEqual(originalDoc.amenities, ["AC"]);
    assert.equal(originalDoc.operatorId.toString(), "op-100");
    assert.equal(saveCount, 1);
    assert.equal(uploadCount, 1);
  });

  await t.test("falsy value updates preserve existing fields and skip upload", async () => {
    const doc = makeScheduleDoc();
    let saveCount = 0, uploadCount = 0;
    const service = createBusOwnerScheduleService({
      repository: { findScheduleById: async () => doc, saveSchedule: async () => { saveCount++; } },
      imageService: { uploadThumbnail: async () => { uploadCount++; } },
    });
    const controller = createBusOwnerScheduleController({ service });
    const res = mockRes();

    await controller.updateSchedule({
      body: { ticketId: "sch-100", operatorName: "", bussName: "", price: 0, totalSeats: 0, boardingPoints: undefined },
      userInfo,
    }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.jsonBody, {
      status: true,
      message: "Ticket updated successfully!",
      data: doc,
    });
    assert.equal(doc.operatorName, "Old Op");
    assert.equal(doc.bussName, "Old Bus");
    assert.equal(doc.price, 500);
    assert.equal(doc.yatrapoints, 50);
    assert.equal(doc.totalSeats, 30);
    assert.deepEqual(doc.boardingPoints, ["Stop A"]);
    assert.equal(uploadCount, 0);
    assert.equal(saveCount, 1);
  });

  await t.test("thumbnail upload error reaches 500 without calling saveSchedule or exposing message", async () => {
    let saveCalled = false;
    const service = createBusOwnerScheduleService({
      repository: { findScheduleById: async () => makeScheduleDoc(), saveSchedule: async () => { saveCalled = true; } },
      imageService: { uploadThumbnail: async () => { throw new Error("Cloudinary Error"); } },
    });
    const controller = createBusOwnerScheduleController({ service });
    const res = mockRes();

    await controller.updateSchedule({ body: { ticketId: "sch-100" }, userInfo, files: { thumbnail: {} } }, res);

    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.jsonBody, { status: false, message: "Internal Server Error" });
    assert.equal(saveCalled, false);
  });
});
