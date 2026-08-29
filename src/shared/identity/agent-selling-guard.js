"use strict";

const { isAssignmentSellable } = require("./agent-assignment-status");
const { ACCESS_SCOPES } = require("./agent-assignment-terms");

const SELLABLE_TRIP_STATUSES = Object.freeze(["scheduled", "boarding"]);
const sellableStatuses = new Set(SELLABLE_TRIP_STATUSES);
const idOf = (value) => String(value?._id || value || "");
const idSet = (values) => new Set((values || []).map(idOf));

const startOfUtcDay = (value = new Date()) => {
  const date = new Date(value);
  date.setUTCHours(0, 0, 0, 0);
  return date;
};

/**
 * Inventory-scope half of agent sale authorization. The catalogue and the
 * future hold writer share this pure Trip predicate; KYC is the separate gate.
 */
const filterSellableTrips = ({ assignment, trips, now = new Date() }) => {
  if (!isAssignmentSellable(assignment?.status)) return [];

  const brandId = idOf(assignment.operatorId);
  if (!brandId) return [];
  const allowedRoutes = idSet(assignment.allowedRouteIds);
  const allowedSchedules = idSet(assignment.allowedScheduleIds);
  const today = startOfUtcDay(now).getTime();

  return (trips || []).filter((trip) => {
    if (idOf(trip?.brandId) !== brandId) return false;
    if (trip?.isActive !== true) return false;
    if (!sellableStatuses.has(trip.status)) return false;
    const tripTime = new Date(trip.tripDate).getTime();
    if (!Number.isFinite(tripTime) || tripTime < today) return false;
    const bookingClosesAt = new Date(trip.bookingClosesAt).getTime();
    if (!Number.isFinite(bookingClosesAt) || bookingClosesAt <= now.getTime()) return false;

    if (assignment.accessScope === ACCESS_SCOPES.ALL_BUSES) return true;
    if (assignment.accessScope === ACCESS_SCOPES.ROUTES) {
      return allowedRoutes.has(idOf(trip.variantId));
    }
    if (assignment.accessScope === ACCESS_SCOPES.SCHEDULES) {
      return allowedSchedules.has(idOf(trip.scheduleId));
    }
    return false;
  });
};

module.exports = {
  SELLABLE_TRIP_STATUSES,
  filterSellableTrips,
  startOfUtcDay,
};
