"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createBusOwnerScheduleService } = require("../../../../src/modules/bus-owner/schedule-management/bus-owner-schedule.service");
const { createBusOwnerScheduleController } = require("../../../../src/modules/bus-owner/schedule-management/bus-owner-schedule.controller");

const validBody = {
  operatorName: "Express Travels",
  bussName: "Super Deluxe",
  vehicleType: "Bus",
  departureTime: "07:00 AM",
  arrivalTime: "02:00 PM",
  date: "2026-08-01",
  from: "Kathmandu",
  to: "Pokhara",
  price: 1000,
  totalSeats: 35,
  bussNo: "BA 1 PA 1234",
  totalTimeTaken: "7 hours",
  shift: "Day",
};

const userInfo = { id: "op-123", role: "busOwner" };

const mockRes = () => {
  const res = { statusCode: 200, jsonBody: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (data) => { res.jsonBody = data; return res; };
  return res;
};

test("createSchedule service and controller", async (t) => {
  await t.test("empty body returns exact 400 response", async () => {
    let repoCalled = false;
    const service = createBusOwnerScheduleService({
      repository: { createSchedule: async () => { repoCalled = true; } },
    });
    const controller = createBusOwnerScheduleController({ service });
    const res = mockRes();

    await controller.createSchedule({ body: {}, userInfo }, res);

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.jsonBody, { status: false, message: "your body is empty please add" });
    assert.equal(repoCalled, false);
  });

  await t.test("missing required fields or falsy price returns 400 Missing required fields.", async () => {
    const service = createBusOwnerScheduleService({ repository: {} });
    const controller = createBusOwnerScheduleController({ service });

    const requiredKeys = ["operatorName", "bussName", "vehicleType", "departureTime", "arrivalTime", "from", "to", "price", "totalSeats", "bussNo", "totalTimeTaken", "shift"];

    for (const key of requiredKeys) {
      const body = { ...validBody, [key]: key === "price" ? 0 : "" };
      const res = mockRes();
      await controller.createSchedule({ body, userInfo }, res);
      assert.equal(res.statusCode, 400);
      assert.deepEqual(res.jsonBody, { status: false, message: "Missing required fields." });
    }
  });

  await t.test("valid creation payload with defaults and Math.round(price * 0.1) yatrapoints", async () => {
    let createdPayload = null;
    const dummyDoc = { _id: "sch-1", ...validBody };
    const service = createBusOwnerScheduleService({
      repository: {
        createSchedule: async (data) => { createdPayload = data; return dummyDoc; },
      },
    });
    const controller = createBusOwnerScheduleController({ service });
    const res = mockRes();

    await controller.createSchedule({ body: validBody, userInfo }, res);

    assert.equal(res.statusCode, 201);
    assert.deepEqual(res.jsonBody, { status: true, message: "Bus ticket created!", data: dummyDoc });

    assert.deepEqual(createdPayload, {
      operatorName: "Express Travels",
      bussName: "Super Deluxe",
      bussNo: "BA 1 PA 1234",
      vehicleType: "Bus",
      departureTime: "07:00 AM",
      arrivalTime: "02:00 PM",
      date: "2026-08-01",
      route: { from: "Kathmandu", to: "Pokhara" },
      price: 1000,
      yatrapoints: 100,
      totalSeats: 35,
      totalTimeTaken: "7 hours",
      shift: "Day",
      boardingPoints: [],
      amenities: [],
      thumbnail: null,
      operatorId: "op-123",
      operatorRole: "busOwner",
    });

    assert.equal(Object.hasOwn(createdPayload, "routeId"), false);
  });

  await t.test("truthy routeId included, custom boardingPoints and amenities passed", async () => {
    let createdPayload = null;
    const service = createBusOwnerScheduleService({
      repository: { createSchedule: async (data) => { createdPayload = data; return {}; } },
    });
    const controller = createBusOwnerScheduleController({ service });
    const res = mockRes();

    const body = { ...validBody, routeId: "route-99", boardingPoints: ["Kalanki"], amenities: ["WiFi"] };
    await controller.createSchedule({ body, userInfo }, res);

    assert.deepEqual(createdPayload, {
      operatorName: "Express Travels",
      bussName: "Super Deluxe",
      bussNo: "BA 1 PA 1234",
      vehicleType: "Bus",
      departureTime: "07:00 AM",
      arrivalTime: "02:00 PM",
      date: "2026-08-01",
      route: { from: "Kathmandu", to: "Pokhara" },
      routeId: "route-99",
      price: 1000,
      yatrapoints: 100,
      totalSeats: 35,
      totalTimeTaken: "7 hours",
      shift: "Day",
      boardingPoints: ["Kalanki"],
      amenities: ["WiFi"],
      thumbnail: null,
      operatorId: "op-123",
      operatorRole: "busOwner",
    });
  });

  await t.test("repository failure returns 500 Internal Server Error!", async () => {
    const service = createBusOwnerScheduleService({
      repository: { createSchedule: async () => { throw new Error("DB error"); } },
    });
    const controller = createBusOwnerScheduleController({ service });
    const res = mockRes();

    await controller.createSchedule({ body: validBody, userInfo }, res);

    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.jsonBody, { status: false, message: "Internal Server Error!" });
  });
});
