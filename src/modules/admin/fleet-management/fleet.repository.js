"use strict";

function createFleetRepository({ Bus, Trip, Schedule }) {
  async function findAll(query) {
    return Bus.find(query)
      .populate("ownerId", "name email phone")
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
      .select("+fleetDocuments.fitnessCert.objectKey +fleetDocuments.insurance.objectKey +fleetDocuments.bluebook.objectKey +fleetDocuments.routePermit.objectKey +fleetDocuments.fitnessCert.mimeType +fleetDocuments.insurance.mimeType +fleetDocuments.bluebook.mimeType +fleetDocuments.routePermit.mimeType +fleetImages.objectKey +fleetImages.mimeType")
      .populate("ownerId", "name email phone address")
      .populate("amenitiesId")
      .populate("boardingPointId")
      .populate({
        path: "corridorId",
        populate: [
          { path: "originId", select: "name city" },
          { path: "destinationId", select: "name city" }
        ]
      });
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

  async function atomicDecidePendingFleet({ fleetId, update }) {
    return Bus.findOneAndUpdate(
      { _id: fleetId, approvalStatus: "PENDING" },
      update,
      { new: true, runValidators: true }
    )
      .populate("ownerId", "name email phone")
      .exec();
  }

  async function findApprovalStatusById(fleetId) {
    return Bus.findById(fleetId).select("approvalStatus").lean();
  }

  async function savePendingReviewItem({ fleetId, path, review }) {
    return Bus.findOneAndUpdate(
      { _id: fleetId, approvalStatus: "PENDING" },
      { $set: { [path]: review }, $inc: { __v: 1 } },
      { new: true, runValidators: true }
    ).select("_id approvalStatus").lean();
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
    atomicDecidePendingFleet,
    findApprovalStatusById,
    savePendingReviewItem,
    countDashboard,
  };
}

module.exports = { createFleetRepository };
