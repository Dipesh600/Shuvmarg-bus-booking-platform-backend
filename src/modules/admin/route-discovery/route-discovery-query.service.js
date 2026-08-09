"use strict";

const RouteDiscovery = require("../../../../models/routeDiscoveryModel.js");

const listDiscoverySessions = async (filters = {}) => {
  const query = {};
  if (filters.status) query.status = filters.status;
  if (filters.originStopId) query.originStopId = filters.originStopId;
  if (filters.destinationStopId) query.destinationStopId = filters.destinationStopId;
  const page = Math.max(1, parseInt(filters.page) || 1);
  const limit = Math.min(50, parseInt(filters.limit) || 20);
  const skip = (page - 1) * limit;
  const [sessions, total] = await Promise.all([
    RouteDiscovery.find(query)
      .populate("originStopId", "name code")
      .populate("destinationStopId", "name code")
      .populate("corridorId", "code status originId destinationId")
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    RouteDiscovery.countDocuments(query),
  ]);
  return { sessions, total, page, limit, totalPages: Math.ceil(total / limit) };
};

const getDiscoverySession = async (sessionId) => {
  const session = await RouteDiscovery.findById(sessionId)
    .populate("originStopId", "name code province district coordinates")
    .populate("destinationStopId", "name code province district coordinates")
    .populate("corridorId", "code status originId destinationId")
    .populate("createdBy", "name email")
    .populate("approvedBy", "name email")
    .populate("discoveredStops.routeStopId", "name code coordinates")
    .populate("discoveredStops.mergedIntoRouteStopId", "name code")
    .lean();
  if (!session) throw new Error("Discovery session not found.");
  return session;
};

module.exports = { listDiscoverySessions, getDiscoverySession };
