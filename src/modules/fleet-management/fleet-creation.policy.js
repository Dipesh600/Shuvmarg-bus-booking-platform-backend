"use strict";

const { ApiError } = require("../../contracts");

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
  return {
    ...data,
    busNumber: String(data.busNumber).trim().toUpperCase(),
    totalSeats: Number(data.totalSeats),
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
}) {
  async function validateReferences(input) {
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
