'use strict';

const { SELLABLE_ASSIGNMENT_STATUSES } = require('../../../shared/identity/agent-assignment-status');
const { ACCESS_SCOPES } = require('../../../shared/identity/agent-assignment-terms');
const {
  SELLABLE_TRIP_STATUSES,
  startOfUtcDay,
} = require('../../../shared/identity/agent-selling-guard');
const Agent = require('../../../../models/agentModel');
const AgentAssignment = require('../../../../models/agentAssignmentModel');
const FareRule = require('../../../../models/fareRuleModel');
const Seat = require('../../../../models/seatsModel');
const SeatHold = require('../../../../models/seatHoldModel');
const Trip = require('../../../../models/tripModel');

const MAX_ACTIVE_ASSIGNMENTS = 100;

const findAgentForUser = (userId) => Agent
  .findOne({ user: userId })
  .select('_id scope agentType applicationStatus outletType operationType businessName district municipality')
  .populate({ path: 'user', select: 'phoneVerified' })
  .lean();

const assignmentFilter = (agentId) => ({
  agentId,
  status: { $in: [...SELLABLE_ASSIGNMENT_STATUSES] },
});

const findSellableAssignments = (agentId) => AgentAssignment
  .find(assignmentFilter(agentId))
  .select('operatorId ownerId status accessScope allowedRouteIds allowedScheduleIds permissions operatorCommission')
  .populate({ path: 'operatorId', select: 'brandName' })
  .sort({ createdAt: -1 })
  .limit(MAX_ACTIVE_ASSIGNMENTS + 1)
  .lean();

const countSellableAssignments = (agentId) => AgentAssignment.countDocuments(
  assignmentFilter(agentId),
);

const tripFilter = (assignment, now) => {
  const filter = {
    brandId: assignment.operatorId?._id || assignment.operatorId,
    status: { $in: [...SELLABLE_TRIP_STATUSES] },
    tripDate: { $gte: startOfUtcDay(now) },
    bookingClosesAt: { $gt: now },
    isActive: true,
  };
  if (assignment.accessScope === ACCESS_SCOPES.ROUTES) {
    filter.variantId = { $in: assignment.allowedRouteIds || [] };
  } else if (assignment.accessScope === ACCESS_SCOPES.SCHEDULES) {
    filter.scheduleId = { $in: assignment.allowedScheduleIds || [] };
  } else if (assignment.accessScope !== ACCESS_SCOPES.ALL_BUSES) {
    filter._id = { $in: [] };
  }
  return filter;
};

const buildSellableTripQuery = (assignment, { page, limit, now = new Date() }) => Trip
  .find(tripFilter(assignment, now))
  .select('_id brandId busId routeId variantId scheduleId tripDate departureTime arrivalTime bookingClosesAt shift status isActive tripFare directionLabel fromStopName toStopName')
  .populate({ path: 'busId', select: 'busName busNumber busType vehicleType' })
  .populate({ path: 'routeId', select: 'routeName from to via' })
  .populate({ path: 'variantId', select: 'code name direction' })
  .sort({ tripDate: 1, departureTime: 1, _id: 1 })
  .skip((page - 1) * limit)
  .limit(limit + 1);

const findTripsForAssignment = (assignment, pagination) => buildSellableTripQuery(
  assignment,
  pagination,
).lean();

const findFareRulesForTrips = (ownerId, trips) => FareRule.find({
  ownerId,
  isActive: true,
  $or: trips.flatMap((trip) => {
    const fleetId = trip.busId?._id || trip.busId;
    const routeId = trip.routeId?._id || trip.routeId;
    return [{ fleetId, routeId }, { fleetId, routeId: null }];
  }),
})
  .select('fleetId routeId baseFare seatClassPremium advanceDiscount peakPricing')
  .lean();

const findAvailabilityForTrips = async (tripIds, now = new Date()) => {
  const [seatDocs, holds] = await Promise.all([
    Seat.find({ tripId: { $in: tripIds } })
      .select('tripId seata.seatNo seata.booked seata.blockedFor seatb.seatNo seatb.booked seatb.blockedFor seatc.seatNo seatc.booked seatc.blockedFor')
      .lean(),
    SeatHold.find({
      tripId: { $in: tripIds },
      status: { $in: ['held', 'processing'] },
      expiresAt: { $gt: now },
    }).select('tripId seatNumbers').lean(),
  ]);
  return { seatDocs, holds };
};

module.exports = {
  MAX_ACTIVE_ASSIGNMENTS,
  buildSellableTripQuery,
  countSellableAssignments,
  findAgentForUser,
  findAvailabilityForTrips,
  findFareRulesForTrips,
  findSellableAssignments,
  findTripsForAssignment,
};
