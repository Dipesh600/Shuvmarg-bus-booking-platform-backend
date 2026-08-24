"use strict";

const { ApiError } = require("../../contracts");

function parseJson(value, fallback, field = "value") {
  if (!value) return fallback;
  try {
    return typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    throw new ApiError("FLEET_VALIDATION_FAILED", `${field} must be valid JSON.`);
  }
}

function parseStringArray(value, field) {
  const parsed = parseJson(value, [], field);
  if (!Array.isArray(parsed)) {
    throw new ApiError("FLEET_VALIDATION_FAILED", `${field} must be an array.`);
  }
  const normalized = parsed.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean);
  if (normalized.length !== parsed.length || new Set(normalized).size !== normalized.length) {
    throw new ApiError("FLEET_VALIDATION_FAILED", `${field} contains invalid or duplicate values.`);
  }
  return normalized;
}

function parseCreationInput(data) {
  const required = [
    "busName", "busNumber", "busType", "totalSeats", "vehicleType",
    "registrationYear",
  ];
  if (required.some((field) => !data[field])) {
    throw new ApiError("FLEET_VALIDATION_FAILED", "Missing required fleet fields.");
  }
  const busName = String(data.busName).trim();
  const busNumber = String(data.busNumber).trim().toUpperCase();
  const busType = String(data.busType).trim();
  if (busName.length < 2 || busName.length > 100 || busNumber.length < 2 || busNumber.length > 32 || busType.length < 2 || busType.length > 40) {
    throw new ApiError("FLEET_VALIDATION_FAILED", "Fleet name, plate number, or bus type is invalid.");
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
  const registrationYear = Number(data.registrationYear);
  const currentYear = new Date().getFullYear();
  if (!Number.isInteger(registrationYear) || registrationYear < 1980 || registrationYear > currentYear + 1) {
    throw new ApiError(
      "FLEET_VALIDATION_FAILED",
      `Registration year must be between 1980 and ${currentYear + 1}.`
    );
  }
  const vehicleType = String(data.vehicleType).trim().toLowerCase();
  if (!["bus", "minibus", "hiace", "jeep"].includes(vehicleType)) {
    throw new ApiError("FLEET_VALIDATION_FAILED", "Invalid vehicle type.");
  }
  const totalSeats = Number(data.totalSeats);
  if (!Number.isInteger(totalSeats) || totalSeats < 1) {
    throw new ApiError("FLEET_VALIDATION_FAILED", "Total seats must be a positive integer.");
  }
  return {
    ...data,
    busName,
    busNumber,
    busType,
    vehicleType,
    totalSeats,
    registrationYear,
    seatConfig,
    amenityIds: parseStringArray(data.amenityIds, "amenityIds"),
    requestViaStops: parseStringArray(data.requestViaStops, "requestViaStops"),
  };
}

function createFleetCreationPolicy({
  Bus,
  BusAmenities,
  BoardingPoints,
  OperatorBrand,
}) {
  async function validateReferences(input, ownerId) {
    if (typeof Bus.findOne === "function") {
      const existing = await Bus.findOne({ busNumber: input.busNumber });
      if (existing) {
        const isSameOwnerDraft =
          ownerId &&
          String(existing.ownerId) === String(ownerId) &&
          existing.approvalStatus === "DRAFT";
        if (!isSameOwnerDraft) {
          throw new ApiError("FLEET_ALREADY_EXISTS", "Bus number already exists!");
        }
      }
    }
    if (input.amenitiesId && !await BusAmenities.findById(input.amenitiesId)) {
      throw new ApiError("FLEET_VALIDATION_FAILED", "Invalid amenitiesId provided.");
    }
    if (input.amenityIds.length > 0) {
      const count = await BusAmenities.countDocuments({
        _id: { $in: input.amenityIds },
        status: true,
        $or: [{ type: "GLOBAL" }, { type: "CUSTOM", ownerId }],
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

  async function validateBrand(brandId, ownerId) {
    if (!brandId) {
      throw new ApiError("FLEET_BRAND_REQUIRED", "Operator brand is required.");
    }
    const brandIdStr = typeof brandId === "object" && brandId?._id ? String(brandId._id) : String(brandId).trim();
    if (!/^[0-9a-fA-F]{24}$/.test(brandIdStr)) {
      throw new ApiError("FLEET_BRAND_INVALID", "Invalid operator brand ID.");
    }
    const brand = await OperatorBrand.findById(brandIdStr)
      .select("status brandName ownerId")
      .lean();
    if (!brand) {
      throw new ApiError("FLEET_BRAND_NOT_FOUND", "Operator brand not found.");
    }
    if (ownerId && brand.ownerId && String(brand.ownerId) !== String(ownerId)) {
      throw new ApiError("FLEET_BRAND_FORBIDDEN", "Operator brand belongs to another bus owner.", 403);
    }
    if (brand.status !== "ACTIVE") {
      throw new ApiError(
        "FLEET_BRAND_INACTIVE",
        `Operator brand "${brand.brandName}" is not active (current status: ${brand.status}).`,
        409
      );
    }
    return brand;
  }

  return { validateReferences, validateBrand };
}

module.exports = { createFleetCreationPolicy, parseCreationInput, parseJson };
