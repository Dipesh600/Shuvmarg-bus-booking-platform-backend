"use strict";

const mongoose = require("mongoose");
const {
  ALL_DOCUMENT_SLOTS,
  PRIVILEGED_BODY_FIELDS,
  SLOT_METADATA_ALLOW_LIST,
  IMAGE_COLLECTION_LIMITS,
  REQUIRED_FLEET_IMAGE_VIEWS,
} = require("./fleet-document.constants");
const errors = require("./fleet-document.errors");

function validateFleetId(fleetId) {
  if (!fleetId || !mongoose.Types.ObjectId.isValid(fleetId)) {
    throw errors.invalidMetadata("Fleet ID must be a valid ObjectId.");
  }
}

function validateSlot(slot) {
  if (!slot || !ALL_DOCUMENT_SLOTS.includes(slot)) {
    throw errors.invalidSlot(slot);
  }
}

function rejectPrivilegedAndUnknownFields(body, slot) {
  if (!body || typeof body !== "object") return;
  const keys = Object.keys(body);
  for (const key of keys) {
    if (PRIVILEGED_BODY_FIELDS.includes(key)) {
      throw errors.invalidMetadata(`Privileged field '${key}' is forbidden.`);
    }
  }
  const allowed = SLOT_METADATA_ALLOW_LIST[slot] || [];
  for (const key of keys) {
    if (!allowed.includes(key)) {
      throw errors.invalidMetadata(`Field '${key}' is not permitted for slot '${slot}'.`);
    }
  }
}

function validateChangeReason(reason, isRequired) {
  if (!reason && !isRequired) return null;
  if (!reason || typeof reason !== "string") {
    throw errors.reasonRequired();
  }
  const trimmed = reason.trim();
  if (trimmed.length < 5 || trimmed.length > 500) {
    throw errors.reasonRequired();
  }
  return trimmed;
}

function validateSlotMetadata(slot, body) {
  const metadata = {};
  if (slot === "fitnessCert" && body.validTill) {
    const d = new Date(body.validTill);
    if (isNaN(d.getTime())) throw errors.invalidMetadata("fitnessCert.validTill must be a valid date.");
    metadata.validTill = d;
  }
  if (slot === "insurance") {
    if (body.policyNumber) {
      if (typeof body.policyNumber !== "string" || !body.policyNumber.trim()) {
        throw errors.invalidMetadata("insurance.policyNumber must be a non-empty string.");
      }
      metadata.policyNumber = body.policyNumber.trim();
    }
    if (body.validTill) {
      const d = new Date(body.validTill);
      if (isNaN(d.getTime())) throw errors.invalidMetadata("insurance.validTill must be a valid date.");
      metadata.validTill = d;
    }
  }
  if (slot === "routePermit" && body.validTill) {
    const d = new Date(body.validTill);
    if (isNaN(d.getTime())) throw errors.invalidMetadata("routePermit.validTill must be a valid date.");
    metadata.validTill = d;
  }
  return metadata;
}

function validateFilesPayload(slot, files) {
  if (slot === "fleetImages") {
    const named = [
      ["imageFront", "FRONT"],
      ["imageSide", "SIDE"],
      ["imageBack", "BACK"],
      ["imageInside", "INSIDE"],
    ];
    const namedFiles = named.filter(([field]) => files?.[field]);
    if (namedFiles.length > 0) {
      if (namedFiles.length !== REQUIRED_FLEET_IMAGE_VIEWS.length) {
        throw errors.invalidMetadata("Fleet photos require front, side, back, and inside images.");
      }
      return namedFiles.map(([field, view]) => ({ file: files[field], view }));
    }
    const raw = files?.fleetImages || files?.busImage || files?.file;
    if (!raw) throw errors.fileRequired(slot);
    const list = Array.isArray(raw) ? raw : [raw];
    if (list.length < IMAGE_COLLECTION_LIMITS.MIN_COUNT || list.length > IMAGE_COLLECTION_LIMITS.MAX_COUNT) {
      throw errors.invalidMetadata(
        `fleetImages upload requires between ${IMAGE_COLLECTION_LIMITS.MIN_COUNT} and ${IMAGE_COLLECTION_LIMITS.MAX_COUNT} files.`
      );
    }
    return list.map((file, index) => ({ file, view: REQUIRED_FLEET_IMAGE_VIEWS[index] }));
  }
  const file = files?.[slot] || files?.file;
  if (!file) throw errors.fileRequired(slot);
  if (Array.isArray(file)) {
    throw errors.invalidMetadata(`Slot '${slot}' accepts only one file.`);
  }
  return [{ file, view: null }];
}

module.exports = {
  validateFleetId,
  validateSlot,
  rejectPrivilegedAndUnknownFields,
  validateChangeReason,
  validateSlotMetadata,
  validateFilesPayload,
};
