"use strict";

const { ApiError } = require("../../contracts");

const OWNER_PERMITTED_FIELDS = new Set([
  "busName",
  "busNumber",
  "busType",
  "vehicleType",
  "registrationYear",
  "totalSeats",
  "seatConfig",
  "amenityIds",
  "corridorId",
  "brandId",
  "fleetGroupId",
]);

const FORBIDDEN_UPDATE_FIELDS = [
  "fleetDocuments",
  "fleetImages",
  "url",
  "objectKey",
  "storageKey",
  "documentReviews",
  "approvalStatus",
  "status",
];

const APPROVED_LOCKED_FIELDS = [
  "busNumber",
  "vehicleType",
  "registrationYear",
  "seatConfig",
  "totalSeats",
  "busType",
  "corridorId",
];

function sanitizeUpdatePayload(updateData) {
  for (const field of FORBIDDEN_UPDATE_FIELDS) {
    delete updateData[field];
  }
}

function restrictOwnerUpdate(updateData) {
  const sanitized = {};
  for (const key of Object.keys(updateData)) {
    if (OWNER_PERMITTED_FIELDS.has(key)) sanitized[key] = updateData[key];
  }
  for (const key of Object.keys(updateData)) delete updateData[key];
  Object.assign(updateData, sanitized);
  sanitizeUpdatePayload(updateData);
}

function lockApprovedIdentity(fleet, updateData) {
  sanitizeUpdatePayload(updateData);
  if (fleet.approvalStatus !== "APPROVED") return;
  for (const field of APPROVED_LOCKED_FIELDS) delete updateData[field];
}

function parseJsonField(updateData, field) {
  if (!updateData[field] || typeof updateData[field] !== "string") return;
  try {
    updateData[field] = JSON.parse(updateData[field]);
  } catch {
    delete updateData[field];
  }
}

function createFleetUpdatePolicy({ Bus, getTripModel, logger = console }) {
  async function normalizeBusNumber(fleet, updateData) {
    if (!updateData.busNumber) return;
    const normalized = String(updateData.busNumber).trim().toUpperCase();
    if (normalized !== fleet.busNumber) {
      if (await Bus.findOne({ busNumber: normalized })) {
        throw new ApiError("FLEET_ALREADY_EXISTS", "New bus number already exists!");
      }
      updateData.busNumber = normalized;
    }
  }

  async function verifySeatLayout(fleet, updateData) {
    parseJsonField(updateData, "seatConfig");
    if (!updateData.seatConfig) return;
    if (
      JSON.stringify(fleet.seatConfig || {}) ===
      JSON.stringify(updateData.seatConfig)
    ) {
      return;
    }
    try {
      const Trip = getTripModel();
      const count = await Trip.countDocuments({
        busId: fleet._id,
        tripStatus: { $in: ["SCHEDULED", "BOARDING", "DELAYED"] },
      });
      if (count > 0) {
        throw new ApiError(
          "FLEET_VALIDATION_FAILED",
          `Cannot modify seat layout. This fleet has ${count} active future trip(s) scheduled. Please drain or cancel future trips first.`
        );
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error("Trip verification failed during layout update:", error);
    }
  }

  function parseCatalogAndReviews(updateData) {
    parseJsonField(updateData, "amenityIds");
    sanitizeUpdatePayload(updateData);
  }

  return {
    restrictOwnerUpdate,
    lockApprovedIdentity,
    normalizeBusNumber,
    verifySeatLayout,
    parseCatalogAndReviews,
  };
}

module.exports = {
  createFleetUpdatePolicy,
  restrictOwnerUpdate,
  lockApprovedIdentity,
  OWNER_PERMITTED_FIELDS,
};
