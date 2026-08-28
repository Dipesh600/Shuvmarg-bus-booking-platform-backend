'use strict';

const Agent = require('../../../../models/agentModel');
const AgentAssignment = require('../../../../models/agentAssignmentModel');
const Seat = require('../../../../models/seatsModel');
const SeatHold = require('../../../../models/seatHoldModel');
const Trip = require('../../../../models/tripModel');
const Snapshot = require('../../../../models/tripSeatLayoutSnapshotModel');
const Control = require('../../../../models/tripSeatLayoutControlModel');
const { SELLABLE_ASSIGNMENT_STATUSES } = require('../../../shared/identity/agent-assignment-status');

const findAgentForUser = (userId) => Agent.findOne({ user: userId })
  .select('_id user scope agentType applicationStatus')
  .lean();

const findActiveAssignments = (agentId, operatorId) => AgentAssignment.find({
  agentId,
  operatorId,
  status: { $in: [...SELLABLE_ASSIGNMENT_STATUSES] },
}).select('operatorId status accessScope allowedRouteIds allowedScheduleIds permissions').lean();

const findTripCandidate = (tripId) => Trip.findOne({ _id: tripId })
  .select('_id brandId busId routeId variantId scheduleId status tripDate bookingClosesAt isActive tripFare departureTime arrivalTime fromStopName toStopName')
  .populate({ path: 'routeId', select: 'basePrice' })
  .lean();

const findSeatDocument = (tripId) => Seat.findOne({ tripId });

const findLayoutPricing = async (tripId) => {
  const [snapshot, control] = await Promise.all([
    Snapshot.findOne({ tripId }).lean(),
    Control.findOne({ tripId }).lean(),
  ]);
  return snapshot ? { snapshot, control } : null;
};

const authorizeHold = (holdId, userId, assignmentId, brandId) => SeatHold.findOneAndUpdate(
  { _id: holdId, userId, status: 'held' },
  { $set: { agentAssignmentId: assignmentId, authorizedBrandId: brandId } },
  { new: true },
).select('+agentAssignmentId +authorizedBrandId');

module.exports = {
  authorizeHold,
  findActiveAssignments,
  findAgentForUser,
  findLayoutPricing,
  findSeatDocument,
  findTripCandidate,
};
