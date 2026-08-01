"use strict";

const mongoose = require("mongoose");
const BoardingLocation = require("../../../../models/boardingLocationModel.js");
const Assignment = require("../../../../models/operatorBoardingAssignmentModel.js");
const { boardingLocationError } = require(
  "../../../domain/boarding-location/boarding-location-errors.js"
);
const {
  assertOwnedActiveBrand, assertBrandServesStop,
} = require("./brand-ownership.policy.js");
const { mapBoardingAssignment } = require("./boarding-assignment.mapper.js");

const editableFields = [
  "usage", "displayName", "counterNumber", "contactName", "contactPhone",
  "reportingInstructions",
];

function mapWriteError(error) {
  if (error?.code !== 11000) throw error;
  throw boardingLocationError(
    "BOARDING_ASSIGNMENT_CONFLICT",
    "This operator brand already uses the selected boarding location.", 409
  );
}

async function eligibleLocation(id) {
  if (!mongoose.isValidObjectId(id)) {
    throw boardingLocationError("INVALID_BOARDING_LOCATION", "Select a valid boarding location.", 400);
  }
  const location = await BoardingLocation.findOne({
    _id: id, status: "ACTIVE", verificationStatus: "VERIFIED",
  }).lean();
  if (!location) {
    throw boardingLocationError(
      "BOARDING_LOCATION_UNAVAILABLE", "The boarding location is not available.", 409
    );
  }
  return location;
}

async function createBoardingAssignment(ownerId, data) {
  const brand = await assertOwnedActiveBrand(ownerId, data.brandId);
  const location = await eligibleLocation(data.boardingLocationId);
  await assertBrandServesStop(brand._id, location.stopId);
  const payload = {
    brandId: brand._id, boardingLocationId: data.boardingLocationId,
    status: "ACTIVE", createdBy: ownerId,
  };
  for (const key of editableFields) {
    if (data[key] !== undefined) payload[key] = data[key];
  }
  try {
    const assignment = await Assignment.create(payload);
    await assignment.populate("boardingLocationId");
    return mapBoardingAssignment(assignment);
  } catch (error) {
    return mapWriteError(error);
  }
}

async function listBoardingAssignments(ownerId, data) {
  const brand = await assertOwnedActiveBrand(ownerId, data.brandId);
  const query = { brandId: brand._id };
  if (data.status) query.status = data.status;
  const assignments = await Assignment.find(query)
    .populate("boardingLocationId").sort({ createdAt: -1 }).lean();
  return assignments.map(mapBoardingAssignment);
}

async function updateBoardingAssignment(ownerId, id, data) {
  if (!mongoose.isValidObjectId(id)) {
    throw boardingLocationError("INVALID_BOARDING_ASSIGNMENT", "Select a valid assignment.", 400);
  }
  const brand = await assertOwnedActiveBrand(ownerId, data.brandId);
  const assignment = await Assignment.findOne({ _id: id, brandId: brand._id });
  if (!assignment) {
    throw boardingLocationError("BOARDING_ASSIGNMENT_NOT_FOUND", "Boarding assignment not found.", 404);
  }
  if (["PENDING_REVIEW", "REJECTED"].includes(assignment.status)) {
    throw boardingLocationError(
      "BOARDING_ASSIGNMENT_NOT_EDITABLE", "This assignment is awaiting platform review.", 409
    );
  }
  for (const key of editableFields) {
    if (data[key] !== undefined) assignment[key] = data[key];
  }
  if (data.status !== undefined) {
    if (!["ACTIVE", "INACTIVE"].includes(data.status)) {
      throw boardingLocationError("INVALID_ASSIGNMENT_STATUS", "Assignment status is invalid.", 400);
    }
    if (data.status === "ACTIVE") await eligibleLocation(assignment.boardingLocationId);
    assignment.status = data.status;
  }
  await assignment.save();
  await assignment.populate("boardingLocationId");
  return mapBoardingAssignment(assignment);
}

module.exports = {
  createBoardingAssignment, listBoardingAssignments, updateBoardingAssignment,
  editableFields,
};
