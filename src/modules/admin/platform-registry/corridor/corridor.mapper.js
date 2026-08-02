"use strict";

function idOf(value) {
  return String(value?._id || value?.id || value || "");
}

function mapEndpoint(value) {
  if (!value || typeof value !== "object") return { id: idOf(value) };
  return {
    id: idOf(value), code: value.code || null, name: value.name || null,
    municipality: value.municipality || null, district: value.district || null,
    province: value.province || null,
  };
}

function mapCorridor(value) {
  const source = value?.toObject ? value.toObject() : value;
  const origin = mapEndpoint(source.originId);
  const destination = mapEndpoint(source.destinationId);
  const id = idOf(source);
  return {
    id, _id: id, code: source.code, origin, destination,
    // Compatibility aliases for the current admin client.
    originId: origin, destinationId: destination,
    isSymmetric: true, status: source.status,
    source: source.source || "ADMIN",
    sourceReferenceId: source.sourceReferenceId || null,
    notes: source.notes || null,
    createdBy: idOf(source.createdBy) || null,
    updatedBy: idOf(source.updatedBy) || null,
    createdAt: source.createdAt || null, updatedAt: source.updatedAt || null,
  };
}

module.exports = { mapCorridor, mapEndpoint };
