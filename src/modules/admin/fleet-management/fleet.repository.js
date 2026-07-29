"use strict";

function createFleetRepository({ Bus, Trip, Schedule }) {
  async function findAll(query) {
    return Bus.find(query)
      .populate("ownerId", "name email contactNumber")
      .populate("corridorId", "code", null, {
        populate: [
          { path: "originId", select: "name" },
          { path: "destinationId", select: "name" },
        ],
      })
      .sort({ createdAt: -1 })
      .lean();
  }

  async function findActiveSchedule(busId) {
    return Schedule.findOne({ busId, status: "ACTIVE" })
      .select(
        "departureTime arrivalTime operationalModel status returnScheduleId"
      )
      .lean();
  }

  async function findById(id) {
    return Bus.findById(id)
      .populate("ownerId", "name email contactNumber address")
      .populate("amenitiesId")
      .populate("boardingPointId");
  }

  async function findRecentTrips(busId) {
    return Trip.find({ busId })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate("routeId");
  }

  async function findForStatusUpdate(id) {
    return Bus.findById(id).populate("ownerId");
  }

  async function countDashboard() {
    return Promise.all([
      Bus.countDocuments({
        approvalStatus: "APPROVED",
        setupComplete: true,
        status: { $ne: "MAINTENANCE" },
      }),
      Bus.countDocuments({
        approvalStatus: "APPROVED",
        setupComplete: false,
        status: { $ne: "MAINTENANCE" },
      }),
      Bus.countDocuments({ approvalStatus: "PENDING" }),
      Bus.countDocuments({ status: "MAINTENANCE" }),
      Bus.countDocuments({}),
    ]);
  }

  return {
    findAll,
    findActiveSchedule,
    findById,
    findRecentTrips,
    findForStatusUpdate,
    countDashboard,
  };
}

module.exports = { createFleetRepository };
