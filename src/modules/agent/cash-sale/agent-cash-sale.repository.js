'use strict';

const Agent = require('../../../../models/agentModel');
const AgentBooking = require('../../../../models/agentBookingModel');
const SeatHold = require('../../../../models/seatHoldModel');
const Trip = require('../../../../models/tripModel');
const { PASSENGER_CONFIRMATION_PROCESSING_LEASE_MS } = require('../../booking/passenger-seat-hold/passenger-seat-hold.constants');

const findAgentForUser = (userId) => Agent.findOne({ user: userId }).select('_id').lean();

const claimOwnedAgentHold = (holdId, userId, now) => SeatHold.findOneAndUpdate(
  {
    _id: holdId,
    userId,
    status: 'held',
    expiresAt: { $gt: now },
    agentAssignmentId: { $ne: null },
    authorizedBrandId: { $ne: null },
    seatKeys: { $exists: true, $not: { $size: 0 } },
  },
  [{ $set: {
    status: 'processing',
    processingAt: now,
    heldExpiresAt: '$expiresAt',
    expiresAt: { $max: ['$expiresAt', new Date(now.getTime() + PASSENGER_CONFIRMATION_PROCESSING_LEASE_MS)] },
  } }],
  { new: true },
).select('+seatKeys +agentAssignmentId +authorizedBrandId');

const findOwnedHoldState = (holdId, userId) => SeatHold.findOne({ _id: holdId, userId })
  .select('status')
  .lean();

const findTripContext = (tripId) => Trip.findOne({ _id: tripId })
  .select('_id brandId busId routeId scheduleId tripDate departureTime arrivalTime fromStopName toStopName')
  .lean();

const createAgentBooking = (payload) => AgentBooking.create(payload);
const deleteAgentBooking = (agentBookingId) => AgentBooking.deleteOne({ _id: agentBookingId });

module.exports = {
  claimOwnedAgentHold,
  createAgentBooking,
  deleteAgentBooking,
  findAgentForUser,
  findOwnedHoldState,
  findTripContext,
};
