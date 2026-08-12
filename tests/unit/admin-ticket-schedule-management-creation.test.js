"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Seats = require("../../models/seatsModel");
const Schedule = require("../../models/busScheduleModel");
const Bus = require("../../models/fleetModel");
const GoogleRoute = require("../../models/googleRouteModel");
const BusRoute = require("../../models/busRouteModel");
const templates = require("../../services/seatTemplateService.js");
const creation = require(
  "../../src/modules/admin/ticket-schedule-management/" +
  "ticket-schedule-creation.service"
);

function patch(t, object, key, value) {
  const original = object[key];
  object[key] = value;
  t.after(() => { object[key] = original; });
}

function lean(value) {
  return { async lean() { return value; } };
}

const input = {
  busId: "507f1f77bcf86cd799439011",
  routeId: "507f1f77bcf86cd799439012",
  busRouteId: "507f1f77bcf86cd799439013",
  seatTemplateId: "template",
  departureTime: "08:00",
  arrivalTime: "10:00",
  date: "2026-08-01",
  totalTimeTaken: "2h",
  shift: "morning",
};

test("schedule creation preserves bus existence and activity gates",
  async (t) => {
    patch(t, Bus, "findById", () => lean(null));
    assert.deepEqual(await creation.createSchedule(input, "admin"), {
      error: "Bus not found!", statusCode: 404,
    });
    Bus.findById = () => lean({ status: "INACTIVE" });
    assert.deepEqual(await creation.createSchedule(input, "admin"), {
      error: "Fleet is INACTIVE. Cannot create ticket.", statusCode: 400,
    });
  });

test("schedule creation maps seats and preserves current persisted fields",
  async (t) => {
  let googleLookup;
  let savedSeats;
  let savedSchedule;
  patch(t, Bus, "findById", () => lean({
    status: "ACTIVE", ownerId: "owner",
  }));
  patch(t, GoogleRoute, "findById", async (id) => { googleLookup = id; });
  patch(t, BusRoute, "findById", async () => ({ basePrice: 500 }));
  patch(t, templates, "getActiveTemplateById", async () => ({
    seata: [{ seatNo: "A1" }],
    seatb: [],
  }));
  patch(t, Seats.prototype, "save", async function save() {
    savedSeats = this;
  });
  patch(t, Schedule.prototype, "save", async function save() {
    savedSchedule = this;
  });
  const result = await creation.createSchedule(input, "admin-id");
  assert.equal(googleLookup, input.routeId);
  assert.deepEqual(savedSeats.seata.map((seat) => ({
    seatNo: seat.seatNo, booked: seat.booked,
    bookedBy: seat.bookedBy, bookedAt: seat.bookedAt,
  })), [{
    seatNo: "A1", booked: false, bookedBy: null, bookedAt: null,
  }]);
  assert.equal(savedSchedule.busRouteId.toString(), input.busRouteId);
  assert.equal(savedSchedule.seatId.toString(), savedSeats._id.toString());
  assert.equal(savedSchedule.yatrapoints, 50);
  assert.equal(savedSchedule.createdAtBy, undefined);
  assert.equal(result.schedule, savedSchedule);
  assert.equal(result.seats, savedSeats);
});

test("seat mapping preserves empty columns and booking defaults", () => {
  assert.deepEqual(creation.mapSeats(undefined), []);
  assert.deepEqual(creation.mapSeats([{ seatNo: "B2" }]), [{
    seatNo: "B2", booked: false, bookedBy: null, bookedAt: null,
  }]);
});
