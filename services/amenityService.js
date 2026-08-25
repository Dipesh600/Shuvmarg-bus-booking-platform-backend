"use strict";

const mongoose = require("mongoose");
const BusAmenities = require("../models/busAmenitiesModel");
const Bus = require("../models/fleetModel");
const { ApiError } = require("../src/contracts");

const EDITABLE_FIELDS = new Set(["name", "description", "icon", "status"]);

function normalizeInput(data = {}) {
  const name = String(data.name || "").trim().replace(/\s+/g, " ");
  const description = String(data.description || "").trim();
  const icon = String(data.icon || "zap").trim().toLowerCase();
  if (name.length < 2 || name.length > 60) {
    throw new ApiError("AMENITY_VALIDATION_FAILED");
  }
  if (description.length > 240 || icon.length < 1 || icon.length > 50) {
    throw new ApiError("AMENITY_VALIDATION_FAILED");
  }
  return { name, description, icon };
}

function validateId(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError("AMENITY_INVALID_ID");
  }
}

async function createAmenity(data, ownerId = null) {
  if (ownerId) validateId(ownerId);
  const input = normalizeInput(data);
  const type = ownerId ? "CUSTOM" : "GLOBAL";
  try {
    return await BusAmenities.create({ ...input, type, ownerId: ownerId || null, status: true });
  } catch (error) {
    if (error?.code === 11000) {
      throw new ApiError("AMENITY_ALREADY_EXISTS");
    }
    throw error;
  }
}

async function getAllGlobalAmenities() {
  return BusAmenities.find({ type: "GLOBAL" }).sort({ status: -1, name: 1 }).lean();
}

async function getAmenitiesForOwner(ownerId) {
  validateId(ownerId);
  return BusAmenities.find({
    status: true,
    $or: [{ type: "GLOBAL" }, { type: "CUSTOM", ownerId }],
  }).sort({ type: 1, name: 1 }).lean();
}

async function getAmenitiesByUserId(ownerId) {
  validateId(ownerId);
  return BusAmenities.find({ type: "CUSTOM", ownerId }).sort({ status: -1, name: 1 }).lean();
}

async function getAmenityById(id, ownerId = null) {
  validateId(id);
  const amenity = await BusAmenities.findById(id).lean();
  if (!amenity || (ownerId && amenity.type !== "GLOBAL" && String(amenity.ownerId) !== String(ownerId))) {
    throw new ApiError("AMENITY_NOT_FOUND");
  }
  return amenity;
}

async function updateAmenity(id, data, ownerId = null) {
  const current = await getAmenityById(id, ownerId);
  if (ownerId && current.type !== "CUSTOM") {
    throw new ApiError("AMENITY_FORBIDDEN");
  }
  const update = {};
  for (const key of Object.keys(data || {})) if (EDITABLE_FIELDS.has(key)) update[key] = data[key];
  if (update.name !== undefined || update.description !== undefined || update.icon !== undefined) {
    Object.assign(update, normalizeInput({ ...current, ...update }));
  }
  if (update.status !== undefined) update.status = update.status === true;
  try {
    return await BusAmenities.findByIdAndUpdate(id, update, { new: true, runValidators: true }).lean();
  } catch (error) {
    if (error?.code === 11000) {
      throw new ApiError("AMENITY_ALREADY_EXISTS");
    }
    throw error;
  }
}

async function deleteAmenity(id, ownerId = null) {
  const current = await getAmenityById(id, ownerId);
  if (ownerId && current.type !== "CUSTOM") {
    throw new ApiError("AMENITY_FORBIDDEN");
  }
  const usageCount = await Bus.countDocuments({ $or: [{ amenityIds: id }, { amenitiesId: id }] });
  if (usageCount > 0) {
    throw new ApiError("AMENITY_IN_USE", { details: { usageCount } });
  }
  await BusAmenities.findByIdAndDelete(id);
  return { deleted: true };
}

module.exports = {
  createAmenity, getAllGlobalAmenities, getAmenitiesForOwner,
  getAmenitiesByUserId, getAmenityById, updateAmenity, deleteAmenity,
  normalizeInput,
};
