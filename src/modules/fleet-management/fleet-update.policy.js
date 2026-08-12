"use strict";

const { ApiError } = require("../../contracts");
const { createSeatLayoutVerifier } = require("./fleet-seat-layout.policy");

const OWNER_PERMITTED_FIELDS = new Set([
  "busName",
  "busNumber",
  "busType",
  "vehicleType",
  "registrationYear",
  "totalSeats",
  "seatConfig",
  "seatLayoutVersionId",
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
  "seatLayoutVersionId",
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
  const attempted = APPROVED_LOCKED_FIELDS.some((field) =>
    Object.prototype.hasOwnProperty.call(updateData, field)
  );
  if (attempted) throw new ApiError("FLEET_MUTATION_LOCKED");
}

function parseJsonField(updateData, field) {
  if (!updateData[field] || typeof updateData[field] !== "string") return;
  try {
    updateData[field] = JSON.parse(updateData[field]);
  } catch {
    delete updateData[field];
  }
}

function createFleetUpdatePolicy({
  Bus, getTripModel, getSeatLayoutVersionModel, getSeatTemplateModel, logger = console,
}) {
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

  const verifySeatLayout = createSeatLayoutVerifier({ getTripModel, logger });

  async function resolveSeatLayoutVersion(fleet, updateData) {
    if (updateData.seatLayoutVersionId === undefined) return;
    if (!updateData.seatLayoutVersionId) {
      throw new ApiError("FLEET_LAYOUT_INVALID", {
        details: { reason: "A layout version assignment cannot be cleared directly." },
      });
    }
    const Version = getSeatLayoutVersionModel();
    const version = await Version.findById(updateData.seatLayoutVersionId).lean();
    if (!version) throw new ApiError("FLEET_LAYOUT_INVALID");
    const Template = getSeatTemplateModel();
    const template = await Template.findOne({
      _id: version.templateId,
      isActive: true,
    }).select("scope userId").lean();
    if (!template || (
      template.scope !== "GLOBAL" &&
      template.userId?.toString() !== fleet.ownerId?.toString()
    )) throw new ApiError("FLEET_LAYOUT_INVALID", {
      details: { reason: "Seat layout version is not assignable to this operator." },
    });
    updateData.seatConfig = version.seatConfig;
    updateData.totalSeats = version.totalSeats;
  }

  function parseCatalogAndReviews(updateData) {
    parseJsonField(updateData, "amenityIds");
    sanitizeUpdatePayload(updateData);
  }

  return {
    restrictOwnerUpdate,
    lockApprovedIdentity,
    normalizeBusNumber,
    resolveSeatLayoutVersion,
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
