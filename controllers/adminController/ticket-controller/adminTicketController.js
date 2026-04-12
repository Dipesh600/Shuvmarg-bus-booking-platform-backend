const Ticket = require("../../../models/busScheduleModel");
const BoardingPoint = require("../../../models/boardingPointsModel");
const Seats = require("../../../models/seatsModel");
const seatTemplateService = require("../../../services/seatTemplateService.js");
const BusSchedule = require("../../../models/busScheduleModel");
const Bus = require("../../../models/fleetModel");
const Route = require("../../../models/googleRouteModel");
const BusRoute = require("../../../models/busRouteModel");
const getAllTickets = async (req, res) => {
  try {
    const getinfo = req.userInfo;

    let query = {};
    if (getinfo.role !== "admin") {
      query.operatorId = getinfo.id;
    }

    const tickets = await Ticket.find(query);

    if (!tickets || tickets.length === 0) {
      return res.status(404).json({
        status: false,
        message: "No tickets found.",
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
      status: false,
      message: "Internal Server Error!",
    });
  }
};

// Get boarding point by userId
const getBoardingPointByUserId = async (req, res) => {
  try {
    const userId = req.params.userId;
    console.log(userId);
    const boardingPoint = await BoardingPoint.find({ userId });
    return res.status(200).json({
      status: true,
      message: "Boarding point fetched successfully!",
      results: boardingPoint.length,
      data: boardingPoint,
    });
  } catch (error) {
    console.error("Error fetching boarding point:", error);
    return res.status(500).json({
      status: false,
      message: "Internal Server Error!",
    });
  }
};

// Seat Template logic removed and refactored to templateController.js
// Create Bus Route 
const createRoute = async (req, res) => {
  try {
    const { routeName, fromCity, toCity, distance, basePrice, userId } = req.body;
    const adminInfo = req.adminInfo;

    if (!routeName || !fromCity || !toCity || !distance || !basePrice || !userId) {
      return res.status(400).json({
        status: false,
        message: "Route name, from city, to city, distance, base price, status, and user ID are required!",
      });
    }

    const newRoute = new BusRoute({
      routeName,
      fromCity,
      toCity,
      distance,
      basePrice,
      userId,
      createdBy: userId,
      createdById: adminInfo.id,
    });

    await newRoute.save();

    return res.status(201).json({
      status: true,
      message: "Route created successfully!",
      data: newRoute,
    });
  } catch (error) {
    console.error("Error creating route:", error);
    return res.status(500).json({
      status: false,
      message: "Internal Server Error!",
      error: error.message,
    });
  }
};

// Get All Routes
const getAllRoutes = async (req, res) => {
  try {
    const routes = await BusRoute.find().sort({ createdAt: -1 });
    return res.status(200).json({
      status: true,
      message: "All routes fetched successfully!",
      results: routes.length,
      data: routes,
    });
  } catch (error) {
    console.error("Error fetching routes:", error);
    return res.status(500).json({
      status: false,
      message: "Internal Server Error!",
    });
  }
};

// Get Route By ID
const getRouteById = async (req, res) => {
  try {
    const { id } = req.params;
    const route = await BusRoute.findById(id);

    if (!route) {
      return res.status(404).json({
        status: false,
        message: "Route not found!",
      });
    }

    return res.status(200).json({
      status: true,
      message: "Route details fetched successfully!",
      data: route,
    });
  } catch (error) {
    console.error("Error fetching route by ID:", error);
    return res.status(500).json({
      status: false,
      message: "Internal Server Error!",
    });
  }
};

// Update Route
const updateRoute = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const updatedRoute = await BusRoute.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!updatedRoute) {
      return res.status(404).json({
        status: false,
        message: "Route not found!",
      });
    }

    return res.status(200).json({
      status: true,
      message: "Route updated successfully!",
      data: updatedRoute,
    });
  } catch (error) {
    console.error("Error updating route:", error);
    return res.status(500).json({
      status: false,
      message: "Internal Server Error!",
      error: error.message,
    });
  }
};

// Delete Route
const deleteRoute = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedRoute = await BusRoute.findByIdAndDelete(id);

    if (!deletedRoute) {
      return res.status(404).json({
        status: false,
        message: "Route not found!",
      });
    }

    return res.status(200).json({
      status: true,
      message: "Route deleted successfully!",
    });
  } catch (error) {
    console.error("Error deleting route:", error);
    return res.status(500).json({
      status: false,
      message: "Internal Server Error!",
    });
  }
};

// Toggle Route Status
const toggleRouteStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const route = await BusRoute.findById(id);

    if (!route) {
      return res.status(404).json({
        status: false,
        message: "Route not found!",
      });
    }

    route.status = route.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    await route.save();

    return res.status(200).json({
      status: true,
      message: `Route status changed to ${route.status} successfully!`,
      data: route,
    });
  } catch (error) {
    console.error("Error toggling route status:", error);
    return res.status(500).json({
      status: false,
      message: "Internal Server Error!",
    });
  }
};
// Create Bus Schedule
const createTicket = async (req, res) => {
  try {
    let { busId, routeId, seatTemplateId, busRouteId, departureTime, arrivalTime, date, totalTimeTaken, shift } = req.body;
    const adminInfo = req.adminInfo;

    // Fallback: If busRouteId is missing but routeId is provided, use routeId as busRouteId
    if (!busRouteId && routeId) {
      busRouteId = routeId;
    }

    if (!busId || !seatTemplateId || !busRouteId || !departureTime || !arrivalTime || !date || !totalTimeTaken || !shift) {
      return res.status(400).json({
        status: false,
        message: "Missing required fields: busId, seatTemplateId, busRouteId (or routeId), departureTime, arrivalTime, date, totalTimeTaken, and shift are all required!",
      });
    }

    const bus = await Bus.findById(busId).lean();
    console.log("DEBUG - Bus found:", bus);
    console.log("DEBUG - Bus ownerId:", bus?.ownerId);
    if (!bus) {
      return res.status(404).json({
        status: false,
        message: "Bus not found!",
      });
    }

    if (bus.status === "INACTIVE") {
      return res.status(400).json({
        status: false,
        message: "Fleet is INACTIVE. Cannot create ticket.",
      });
    }

    // Secondary route (Google map) lookup is optional
    let googleRoute = null;
    if (routeId) {
      googleRoute = await Route.findById(routeId);
    }

    const busRoute = await BusRoute.findById(busRouteId);
    if (!busRoute) {
      return res.status(404).json({
        status: false,
        message: "Bus route details (from BusRoute model) not found!",
      });
    }

    const template = await seatTemplateService.getTemplateById(seatTemplateId);
    if (!template) {
      return res.status(404).json({
        status: false,
        message: "Seat template not found!",
      });
    }

    // now here take price and basePrice from busRoute then calculate the yatra point of 10% of basePrice
    const yatrapoints = busRoute.basePrice * 0.1;

    // Create associated Seats from template FIRST
    const mapSeats = (templateSeats) => {
      return (templateSeats || []).map(s => ({
        seatNo: s.seatNo,
        booked: false,
        bookedBy: null,
        bookedAt: null
      }));
    };

    const newSeats = new Seats({
      seata: mapSeats(template.seata),
      seatb: mapSeats(template.seatb),
      seatc: mapSeats(template.seatc),
    });

    await newSeats.save();

    // Now create Bus Schedule with seatId
    const newBusSchedule = new BusSchedule({
      busId,
      routeId,
      busRouteId,
      seatId: newSeats._id,
      departureTime,
      arrivalTime,
      date,
      totalTimeTaken,
      shift,
      createdAtBy: adminInfo?.id,
      yatrapoints,
    });

    await newBusSchedule.save();

    return res.status(201).json({
      status: true,
      message: "Bus schedule and seats created successfully!",
      data: {
        schedule: newBusSchedule,
        seats: newSeats
      },
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
};

// Get Bus Schedule (Ticket) by ID
const getTicketById = async (req, res) => {
  try {
    const { id } = req.params;
    const ticket = await BusSchedule.findById(id)
      .populate("busId")
      .populate("busRouteId");

    if (!ticket) {
      return res.status(404).json({
        status: false,
        message: "Bus schedule not found!",
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
};

// Update Bus Schedule (Ticket)
const updateTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const updatedTicket = await BusSchedule.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!updatedTicket) {
      return res.status(404).json({
        status: false,
        message: "Bus schedule not found!",
      });
    }

    return res.status(200).json({
      status: true,
      message: "Bus schedule updated successfully!",
      data: updatedTicket,
    });
  } catch (error) {
    console.error("Error updating bus schedule:", error);
    return res.status(500).json({
      status: false,
      message: "Internal Server Error!",
      error: error.message,
    });
  }
};

// Toggle Bus Schedule Status (isActive)
const updateTicketStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const ticket = await BusSchedule.findById(id);

    if (!ticket) {
      return res.status(404).json({
        status: false,
        message: "Bus schedule not found!",
      });
    }

    ticket.isActive = !ticket.isActive;
    await ticket.save();

    return res.status(200).json({
      status: true,
      message: `Bus schedule status changed to ${ticket.isActive ? "ACTIVE" : "INACTIVE"} successfully!`,
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
};

// Delete Bus Schedule (Ticket)
const deleteTicket = async (req, res) => {
  try {
    const { id } = req.params;

    // Also delete associated seats
    await Seats.deleteMany({ scheduleId: id });

    const deletedTicket = await BusSchedule.findByIdAndDelete(id);

    if (!deletedTicket) {
      return res.status(404).json({
        status: false,
        message: "Bus schedule not found!",
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
};

module.exports = {
  getAllTickets,
  getBoardingPointByUserId,
  createRoute,
  getAllRoutes,
  getRouteById,
  updateRoute,
  deleteRoute,
  toggleRouteStatus,
  createTicket,
  getTicketById,
  updateTicket,
  updateTicketStatus,
  deleteTicket,
};
