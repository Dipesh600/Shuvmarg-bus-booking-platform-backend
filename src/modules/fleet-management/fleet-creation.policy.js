"use strict";

const { ApiError } = require("../../contracts");
const {
  validateSeatLayout,
  seatLayoutFingerprint,
} = require("../../domain/seat-layout/seat-layout.validation");
const { SeatLayoutError } = require("../../domain/seat-layout/seat-layout.error");

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    return fallback;
  }
}

function parseCreationInput(data) {
  const required = [
    "busName", "busNumber", "busType", "totalSeats", "vehicleType",
  ];
  if (required.some((field) => !data[field])) {
    throw new ApiError("FLEET_VALIDATION_FAILED", "Missing required fleet fields.");
  }
  const forbidden = ["fleetDocuments", "fleetImages", "url", "objectKey", "storageKey"];
  for (const field of forbidden) {
    if (data[field] !== undefined) {
      throw new ApiError("FLEET_VALIDATION_FAILED", `Direct document field '${field}' is forbidden during fleet creation.`);
    }
  }
  let seatConfig = null;
  if (data.seatConfig) {
    try {
      seatConfig = typeof data.seatConfig === "string"
        ? JSON.parse(data.seatConfig) : data.seatConfig;
    } catch {
      throw new ApiError("FLEET_VALIDATION_FAILED", "Invalid seatConfig JSON.");
    }
  }
  const receivedSeats = Number(data.totalSeats);
  if (!Number.isInteger(receivedSeats) || receivedSeats < 1) {
    throw new ApiError("FLEET_VALIDATION_FAILED");
  }
  if (seatConfig) {
    try {
      const layout = validateSeatLayout(seatConfig);
      if (layout.totalSeats !== receivedSeats) {
        throw new ApiError("FLEET_LAYOUT_INVALID", {
          details: { expectedSeats: layout.totalSeats, receivedSeats },
        });
      }
      seatConfig = layout.seatConfig;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error instanceof SeatLayoutError) {
        throw new ApiError("FLEET_LAYOUT_INVALID", {
          cause: error,
          details: { reason: error.message, path: error.details?.path },
        });
      }
      throw error;
    }
  }
  return {
    ...data,
    busNumber: String(data.busNumber).trim().toUpperCase(),
    totalSeats: receivedSeats,
    registrationYear: data.registrationYear
      ? Number(data.registrationYear) : null,
    seatConfig,
    amenityIds: parseJson(data.amenityIds, []),
    requestViaStops: parseJson(data.requestViaStops, []),
  };
}

function createFleetCreationPolicy({
  Bus,
  BusAmenities,
  BoardingPoints,
  OperatorBrand,
  SeatLayoutVersion,
  SeatTemplate,
}) {
  async function validateReferences(input, ownerId = null) {
    if (await Bus.findOne({ busNumber: input.busNumber })) {
      throw new ApiError("FLEET_ALREADY_EXISTS", "Bus number already exists!");
    }
    if (input.amenitiesId && !await BusAmenities.findById(input.amenitiesId)) {
      throw new ApiError("FLEET_VALIDATION_FAILED", "Invalid amenitiesId provided.");
    }
    if (input.amenityIds.length > 0) {
      const count = await BusAmenities.countDocuments({
        _id: { $in: input.amenityIds },
      });
      if (count !== input.amenityIds.length) {
        throw new ApiError("FLEET_VALIDATION_FAILED", "One or more amenityIds are invalid.");
      }
    }
    if (
      input.boardingPointId &&
      !await BoardingPoints.findById(input.boardingPointId)
    ) {
      throw new ApiError("FLEET_VALIDATION_FAILED", "Invalid boardingPointId provided.");
    }
    if (input.seatLayoutVersionId) {
      const version = await SeatLayoutVersion.findById(input.seatLayoutVersionId).lean();
      if (!version) throw new ApiError("FLEET_LAYOUT_INVALID");
      const template = await SeatTemplate.findOne({
        _id: version.templateId,
        isActive: true,
      }).select("scope userId").lean();
      if (!template || (
        ownerId && template.scope !== "GLOBAL" &&
        template.userId?.toString() !== ownerId.toString()
      )) throw new ApiError("FLEET_LAYOUT_INVALID", {
        details: { reason: "Seat layout version is not assignable to this operator." },
      });
      if (
        input.seatConfig &&
        seatLayoutFingerprint(input.seatConfig) !== seatLayoutFingerprint(version.seatConfig)
      ) throw new ApiError("FLEET_LAYOUT_INVALID", {
        details: { reason: "Fleet layout does not match the selected immutable version." },
      });
      input.seatConfig = version.seatConfig;
      input.totalSeats = version.totalSeats;
    }
  }

  async function validateBrand(brandId) {
    if (!brandId) return;
    const brand = await OperatorBrand.findById(brandId)
      .select("status brandName")
      .lean();
    if (!brand) throw new ApiError("FLEET_VALIDATION_FAILED", "Brand not found. Verify brandId is correct.");
    if (brand.status === "SUSPENDED") {
      throw new ApiError("FLEET_VALIDATION_FAILED", `Brand "${brand.brandName}" is currently suspended. Reinstate the brand before adding new fleets.`);
    }
  }

  return { validateReferences, validateBrand };
}

module.exports = { createFleetCreationPolicy, parseCreationInput, parseJson };
