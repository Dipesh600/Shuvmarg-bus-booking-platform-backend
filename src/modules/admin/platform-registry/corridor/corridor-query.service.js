"use strict";

const Stop = require("../../../../../models/stopModel.js");
const {
  corridorError,
} = require("../../../../domain/corridor/corridor-errors.js");

const STATUSES = ["ACTIVE", "INACTIVE", "PENDING"];
const SOURCES = ["ADMIN", "ROUTE_REQUEST", "DISCOVERY"];

async function buildCorridorQuery(filters = {}) {
  const query = {};
  if (filters.status) {
    const status = String(filters.status).toUpperCase();
    if (!STATUSES.includes(status)) {
      throw corridorError("INVALID_CORRIDOR_STATUS", "Corridor status is invalid.");
    }
    query.status = status;
  }
  if (filters.source) {
    const source = String(filters.source).toUpperCase();
    if (!SOURCES.includes(source)) {
      throw corridorError("INVALID_CORRIDOR_SOURCE", "Corridor source is invalid.");
    }
    query.source = source;
  }
  if (filters.endpointId) {
    query.$or = [
      { originId: filters.endpointId }, { destinationId: filters.endpointId },
    ];
  }
  const search = String(filters.search || "").trim();
  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, "i");
    const stops = await Stop.find({
      $or: [{ name: regex }, { code: regex }, { aliases: regex }],
    }).select("_id").lean();
    const searchOr = [
      { code: regex },
      { originId: { $in: stops.map((stop) => stop._id) } },
      { destinationId: { $in: stops.map((stop) => stop._id) } },
    ];
    query.$and = [...(query.$and || []), { $or: searchOr }];
  }
  return query;
}

module.exports = { buildCorridorQuery, STATUSES };
