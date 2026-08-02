"use strict";

const mongoose = require("mongoose");
const Assignment = require("../../../../../models/operatorBoardingAssignmentModel.js");
const { boardingLocationError } = require(
  "../../../../domain/boarding-location/boarding-location-errors.js"
);

function mapReviewAssignment(value) {
  const assignment = value?.toObject ? value.toObject() : value;
  const location = assignment.boardingLocationId;
  const brand = assignment.brandId;
  return {
    id: String(assignment._id), usage: assignment.usage,
    displayName: assignment.displayName || null, status: assignment.status,
    rejectionReason: assignment.rejectionReason || null,
    boardingLocation: location && typeof location === "object" ? {
      id: String(location._id), name: location.name,
      verificationStatus: location.verificationStatus, status: location.status,
      stop: location.stopId && typeof location.stopId === "object" ? {
        id: String(location.stopId._id), name: location.stopId.name,
        code: location.stopId.code,
      } : null,
    } : null,
    brand: brand && typeof brand === "object" ? {
      id: String(brand._id), name: brand.brandName, code: brand.brandCode,
      status: brand.status,
    } : null,
  };
}

async function listBoardingAssignmentReviews(filter = {}) {
  const query = {};
  for (const key of ["status", "brandId", "boardingLocationId"]) {
    if (filter[key] !== undefined) query[key] = filter[key];
  }
  const assignments = await Assignment.find(query)
    .populate("brandId", "brandName brandCode status")
    .populate({
      path: "boardingLocationId", select: "name verificationStatus status stopId",
      populate: { path: "stopId", select: "name code" },
    })
    .sort({ createdAt: -1 }).limit(200).lean();
  return assignments.map(mapReviewAssignment);
}

async function reviewBoardingAssignment(id, data, adminId) {
  if (!mongoose.isValidObjectId(id)) {
    throw boardingLocationError("INVALID_BOARDING_ASSIGNMENT", "Select a valid assignment.", 400);
  }
  if (!["ACTIVE", "REJECTED"].includes(data.status)) {
    throw boardingLocationError("INVALID_ASSIGNMENT_REVIEW", "Review must approve or reject the assignment.", 400);
  }
  const assignment = await Assignment.findById(id)
    .populate("brandId", "brandName brandCode status")
    .populate({
      path: "boardingLocationId", select: "name verificationStatus status stopId",
      populate: { path: "stopId", select: "name code" },
    });
  if (!assignment) {
    throw boardingLocationError("BOARDING_ASSIGNMENT_NOT_FOUND", "Boarding assignment not found.", 404);
  }
  if (assignment.status !== "PENDING_REVIEW") {
    throw boardingLocationError("BOARDING_ASSIGNMENT_ALREADY_REVIEWED", "This assignment has already been reviewed.", 409);
  }
  if (data.status === "ACTIVE" && (
    assignment.brandId?.status !== "ACTIVE" ||
    assignment.boardingLocationId?.status !== "ACTIVE" ||
    assignment.boardingLocationId?.verificationStatus !== "VERIFIED"
  )) {
    throw boardingLocationError(
      "BOARDING_ASSIGNMENT_NOT_APPROVABLE",
      "Verify the location and ensure the operator brand is active before approval.", 409
    );
  }
  assignment.status = data.status;
  assignment.rejectionReason = data.status === "REJECTED"
    ? String(data.rejectionReason || "").trim() || null : null;
  assignment.reviewedBy = adminId || null;
  assignment.reviewedAt = new Date();
  await assignment.save();
  return mapReviewAssignment(assignment);
}

module.exports = { listBoardingAssignmentReviews, reviewBoardingAssignment };
