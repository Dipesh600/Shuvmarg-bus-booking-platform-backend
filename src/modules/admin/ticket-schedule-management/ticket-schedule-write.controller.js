"use strict";

const Seats = require("../../../../models/seatsModel");
const BusSchedule = require("../../../../models/busScheduleModel");
const creation = require("./ticket-schedule-creation.service.js");

async function createTicket(req, res) {
  try {
    const input = { ...req.body };
    if (!input.busRouteId && input.routeId) input.busRouteId = input.routeId;
    const required = [
      "busId", "seatTemplateId", "busRouteId", "departureTime",
      "arrivalTime", "date", "totalTimeTaken", "shift",
    ];
    if (required.some((field) => !input[field])) {
      return res.status(400).json({
        status: false,
        message: "Missing required fields: busId, seatTemplateId, " +
          "busRouteId (or routeId), departureTime, arrivalTime, date, " +
          "totalTimeTaken, and shift are all required!",
      });
    }
    const result = await creation.createSchedule(input, req.adminInfo?.id);
    if (result.error) {
      return res.status(result.statusCode).json({
        status: false, message: result.error,
      });
    }
    return res.status(201).json({
      status: true,
      message: "Bus schedule and seats created successfully!",
      data: result,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        status: false,
        message: "A schedule already exists for this bus on the selected date.",
      });
    }
    console.error("Error creating bus schedule:", error);
    return res.status(500).json({
      status: false,
      message: "Internal Server Error!",
      error: error.message,
    });
  }
}

async function updateTicket(req, res) {
  try {
    const ticket = await BusSchedule.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!ticket) {
      return res.status(404).json({
        status: false, message: "Bus schedule not found!",
      });
    }
    return res.status(200).json({
      status: true,
      message: "Bus schedule updated successfully!",
      data: ticket,
    });
  } catch (error) {
    console.error("Error updating bus schedule:", error);
    return res.status(500).json({
      status: false,
      message: "Internal Server Error!",
      error: error.message,
    });
  }
}

async function updateTicketStatus(req, res) {
  try {
    const ticket = await BusSchedule.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({
        status: false, message: "Bus schedule not found!",
      });
    }
    ticket.isActive = !ticket.isActive;
    await ticket.save();
    return res.status(200).json({
      status: true,
      message: `Bus schedule status changed to ${
        ticket.isActive ? "ACTIVE" : "INACTIVE"
      } successfully!`,
      data: ticket,
    });
  } catch (error) {
    console.error("Error toggling bus schedule status:", error);
    return res.status(500).json({
      status: false,
      message: "Internal Server Error!",
      error: error.message,
    });
  }
}

async function deleteTicket(req, res) {
  try {
    await Seats.deleteMany({ scheduleId: req.params.id });
    const ticket = await BusSchedule.findByIdAndDelete(req.params.id);
    if (!ticket) {
      return res.status(404).json({
        status: false, message: "Bus schedule not found!",
      });
    }
    return res.status(200).json({
      status: true,
      message: "Bus schedule and associated seats deleted successfully!",
    });
  } catch (error) {
    console.error("Error deleting bus schedule:", error);
    return res.status(500).json({
      status: false,
      message: "Internal Server Error!",
      error: error.message,
    });
  }
}

module.exports = {
  createTicket, updateTicket, updateTicketStatus, deleteTicket,
};
