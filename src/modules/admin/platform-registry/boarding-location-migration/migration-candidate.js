"use strict";

const mongoose = require("mongoose");
const {
  buildBoardingLocationIdentity,
  normalizeIdentityPart,
} = require("../../../../domain/boarding-location/boarding-location-identity.js");
const {
  normalizeBoardingCoordinates,
} = require("../../../../domain/boarding-location/boarding-location-coordinates.js");

const idOf = (value) => value?._id || value;

function sameCoordinates(left, right) {
  if (!left || !right) return false;
  return Math.abs(Number(left.lat) - Number(right.lat)) < 0.000001 &&
    Math.abs(Number(left.lng) - Number(right.lng)) < 0.000001;
}

function isSyntheticFallback(record, legacyModel, name, coordinates) {
  const stop = record.stopId;
  return legacyModel === "StopPoint" && record.source === "DISCOVERY" &&
    normalizeIdentityPart(name) === normalizeIdentityPart(stop?.name) &&
    sameCoordinates(coordinates, stop?.coordinates);
}

function mapUsage(type) {
  if (type === "BOARDING") return "PICKUP";
  if (type === "DROPPING") return "DROP";
  return "BOTH";
}

function buildMigrationCandidate(record, legacyModel) {
  const stop = record.stopId;
  if (!stop || stop.status !== "ACTIVE" || stop.isRouteStop !== true) {
    throw new Error("Legacy location does not reference an active route stop.");
  }
  const name = String(record.name || record.pointName || "").trim();
  const coordinates = normalizeBoardingCoordinates(record.coordinates);
  const identity = buildBoardingLocationIdentity({ stopId: stop._id, name });
  const privatePoint = legacyModel === "BoardingPoints" && !record.isGlobal;
  return {
    legacyKey: `${legacyModel}:${record._id}`,
    identity,
    syntheticFallback: isSyntheticFallback(
      record, legacyModel, name, coordinates
    ),
    ownerId: privatePoint ? record.ownerId || null : null,
    contactPhone: privatePoint ? record.contactNumber || null : null,
    usage: mapUsage(record.type),
    locationData: {
      _id: new mongoose.Types.ObjectId(),
      stopId: idOf(stop),
      name,
      aliases: record.nameNe ? [record.nameNe] : [],
      landmark: record.landmark || null,
      address: null,
      coordinates,
      verificationStatus: privatePoint
        ? "PENDING"
        : record.verificationStatus || "VERIFIED",
      source: privatePoint
        ? "OPERATOR_REQUEST"
        : record.source === "DISCOVERY" ? "DISCOVERY" : "LEGACY_MIGRATION",
      status: record.status === false || record.status === "INACTIVE"
        ? "INACTIVE" : "ACTIVE",
      createdBy: record.createdBy || null,
      legacySource: { model: legacyModel, id: record._id },
    },
  };
}

module.exports = { buildMigrationCandidate };
