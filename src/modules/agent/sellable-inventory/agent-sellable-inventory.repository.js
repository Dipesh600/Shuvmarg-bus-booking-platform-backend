'use strict';

const { FLEET_APPROVAL_STATUS } = require('../../../contracts/status/fleet-approval.status');
const { FLEET_OPERATIONAL_STATUS } = require('../../../contracts/status/fleet-operational.status');
const { SELLABLE_ASSIGNMENT_STATUSES } = require('../../../shared/identity/agent-assignment-status');
const Agent = require('../../../../models/agentModel');
const AgentAssignment = require('../../../../models/agentAssignmentModel');
const Bus = require('../../../../models/fleetModel');
const BusSchedule = require('../../../../models/busScheduleModel');
const FareRule = require('../../../../models/fareRuleModel');

const MAX_ACTIVE_ASSIGNMENTS = 100;
const MAX_BUSES_PER_ASSIGNMENT = 500;

const findAgentForUser = (userId) => Agent
  .findOne({ user: userId })
  .select('_id scope agentType applicationStatus outletType operationType businessName district municipality')
  .populate({ path: 'user', select: 'phoneVerified' })
  .lean();

const findSellableAssignments = (agentId) => AgentAssignment
  .find({ agentId, status: { $in: [...SELLABLE_ASSIGNMENT_STATUSES] } })
  .select('operatorId ownerId status accessScope allowedRouteIds allowedScheduleIds permissions operatorCommission')
  .populate({ path: 'operatorId', select: 'brandName' })
  .sort({ createdAt: -1 })
  .limit(MAX_ACTIVE_ASSIGNMENTS)
  .lean();

/** Brand is the grant. ownerId only rejects inconsistent denormalised rows. */
const buildApprovedBusQuery = (assignment) => Bus.find({
  brandId: assignment.operatorId?._id || assignment.operatorId,
  ownerId: assignment.ownerId,
  approvalStatus: FLEET_APPROVAL_STATUS.APPROVED,
  status: FLEET_OPERATIONAL_STATUS.ACTIVE,
})
  .select('_id brandId ownerId approvalStatus status busName busNumber busType vehicleType')
  .limit(MAX_BUSES_PER_ASSIGNMENT);

const findApprovedBusesForAssignment = (assignment) => buildApprovedBusQuery(assignment).lean();

const findSchedulesForBuses = (busIds, { page, limit }) => BusSchedule
  .find({ busId: { $in: busIds }, isActive: true })
  .select('_id busId routeId busRouteId departureTime arrivalTime date totalTimeTaken shift yatrapoints isActive')
  .populate({ path: 'routeId', select: 'name' })
  .populate({ path: 'busRouteId', select: 'routeName from to via' })
  .sort({ date: 1, departureTime: 1, _id: 1 })
  .skip((page - 1) * limit)
  .limit(limit + 1)
  .lean();

const findFareRulesForSchedules = (ownerId, schedules) => FareRule
  .find({
    ownerId,
    isActive: true,
    $or: schedules.flatMap((schedule) => {
      const fleetId = schedule.busId?._id || schedule.busId;
      const routeId = schedule.busRouteId?._id || schedule.busRouteId;
      return [{ fleetId, routeId }, { fleetId, routeId: null }];
    }),
  })
  .select('fleetId routeId baseFare seatClassPremium advanceDiscount peakPricing')
  .lean();

module.exports = {
  buildApprovedBusQuery,
  findAgentForUser,
  findApprovedBusesForAssignment,
  findFareRulesForSchedules,
  findSchedulesForBuses,
  findSellableAssignments,
};
