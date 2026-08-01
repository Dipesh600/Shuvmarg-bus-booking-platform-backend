"use strict";

const idOf = (value) => value?._id || value?.id || value || null;

function mapLocation(location) {
  if (!location || typeof location !== "object") return null;
  return {
    id: String(idOf(location)), stopId: String(idOf(location.stopId)),
    name: location.name, landmark: location.landmark || null,
    address: location.address || null, coordinates: location.coordinates,
    verificationStatus: location.verificationStatus, status: location.status,
  };
}

function mapBoardingAssignment(value) {
  const assignment = value?.toObject ? value.toObject() : value;
  return {
    id: String(idOf(assignment)), brandId: String(idOf(assignment.brandId)),
    boardingLocationId: String(idOf(assignment.boardingLocationId)),
    boardingLocation: mapLocation(assignment.boardingLocationId),
    usage: assignment.usage, displayName: assignment.displayName || null,
    counterNumber: assignment.counterNumber || null,
    contactName: assignment.contactName || null,
    contactPhone: assignment.contactPhone || null,
    reportingInstructions: assignment.reportingInstructions || null,
    status: assignment.status, rejectionReason: assignment.rejectionReason || null,
    createdAt: assignment.createdAt, updatedAt: assignment.updatedAt,
  };
}

module.exports = { mapBoardingAssignment, mapLocation };
