"use strict";

const BusSchedule = require("../../../../models/busScheduleModel");

async function getAllTickets(req, res) {
  try {
    const isAdmin = Boolean(req.adminInfo);
    const userId = req.adminInfo?.id ?? req.userInfo?.id;
    const query = isAdmin ? {} : { operatorId: userId };
    const tickets = await BusSchedule.find(query);
    if (!tickets || tickets.length === 0) {
      return res.status(404).json({
        status: false, message: "No tickets found.",
      });
    }
    return res.status(200).json({
      status: true,
      message: "Tickets fetched successfully!",
      results: tickets.length,
      data: tickets,
    });
  } catch (error) {
    console.error("Error fetching all tickets:", error);
    return res.status(500).json({
      status: false, message: "Internal Server Error!",
    });
  }
}

async function getTicketById(req, res) {
  try {
    const ticket = await BusSchedule.findById(req.params.id)
      .populate("busId")
      .populate("busRouteId");
    if (!ticket) {
      return res.status(404).json({
        status: false, message: "Bus schedule not found!",
      });
    }
    return res.status(200).json({
      status: true,
      message: "Bus schedule fetched successfully!",
      data: ticket,
    });
  } catch (error) {
    console.error("Error fetching bus schedule:", error);
    return res.status(500).json({
      status: false,
      message: "Internal Server Error!",
      error: error.message,
    });
  }
}

module.exports = { getAllTickets, getTicketById };
