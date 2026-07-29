"use strict";

const Seats = require("../../../../models/seatsModel");
const BusSchedule = require("../../../../models/busScheduleModel");
const Bus = require("../../../../models/fleetModel");
const GoogleRoute = require("../../../../models/googleRouteModel");
const BusRoute = require("../../../../models/busRouteModel");
const templates = require("../../../../services/seatTemplateService.js");

function mapSeats(templateSeats) {
  return (templateSeats || []).map((seat) => ({
    seatNo: seat.seatNo,
    booked: false,
    bookedBy: null,
    bookedAt: null,
  }));
}

async function createSchedule(input, adminId) {
  const {
    busId, routeId, seatTemplateId, departureTime,
    arrivalTime, date, totalTimeTaken, shift,
  } = input;
  const busRouteId = input.busRouteId || routeId;
  const bus = await Bus.findById(busId).lean();
  if (!bus) return { error: "Bus not found!", statusCode: 404 };
  if (bus.status === "INACTIVE") {
    return {
      error: "Fleet is INACTIVE. Cannot create ticket.",
      statusCode: 400,
    };
  }
  if (routeId) await GoogleRoute.findById(routeId);
  const busRoute = await BusRoute.findById(busRouteId);
  if (!busRoute) {
    return {
      error: "Bus route details (from BusRoute model) not found!",
      statusCode: 404,
    };
  }
  const template = await templates.getTemplateById(seatTemplateId);
  if (!template) {
    return { error: "Seat template not found!", statusCode: 404 };
  }
  const seats = new Seats({
    seata: mapSeats(template.seata),
    seatb: mapSeats(template.seatb),
    seatc: mapSeats(template.seatc),
  });
  await seats.save();
  const schedule = new BusSchedule({
    busId,
    routeId,
    busRouteId,
    seatId: seats._id,
    departureTime,
    arrivalTime,
    date,
    totalTimeTaken,
    shift,
    createdAtBy: adminId,
    yatrapoints: busRoute.basePrice * 0.1,
  });
  await schedule.save();
  return { schedule, seats };
}

module.exports = { createSchedule, mapSeats };
