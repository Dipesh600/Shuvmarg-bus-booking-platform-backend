'use strict';

const { effectiveKycStatus, hasVerifiedBadge } = require('../../../shared/identity/agent-assignability');
const { filterSellableTrips } = require('../../../shared/identity/agent-selling-guard');
const logger = require('../../../../utils/logger');
const errors = require('./agent-sellable-inventory.errors');
const mapper = require('./agent-sellable-inventory.mapper');
const parse = require('./agent-sellable-inventory.parse');
const repository = require('./agent-sellable-inventory.repository');

const mapDataError = (error) => {
  if (error.name === 'ValidationError') {
    throw errors.invalidInputError(Object.values(error.errors || {}).map((item) => item.message));
  }
  if (error.code === 11000) throw errors.inventoryConflictError();
  throw error;
};

const loadGroup = async (assignment, pagination, now) => {
  const candidates = await repository.findTripsForAssignment(
    assignment,
    { ...pagination, now },
  );
  const hasMore = candidates.length > pagination.limit;
  const trips = filterSellableTrips({
    assignment,
    trips: candidates.slice(0, pagination.limit),
    now,
  });
  if (trips.length === 0) {
    return { assignment, trips, fareRules: [], availability: {}, hasMore };
  }
  const [fareRules, availability] = await Promise.all([
    repository.findFareRulesForTrips(assignment.ownerId, trips),
    repository.findAvailabilityForTrips(trips.map((trip) => trip._id), now),
  ]);
  return { assignment, trips, fareRules, availability, hasMore };
};

const boundedAssignments = async (agentId, rows) => {
  if (rows.length <= repository.MAX_ACTIVE_ASSIGNMENTS) return rows;
  const total = await repository.countSellableAssignments(agentId);
  logger.warn('Agent inventory assignment fan-out capped', {
    agentId: String(agentId),
    kept: repository.MAX_ACTIVE_ASSIGNMENTS,
    dropped: Math.max(0, total - repository.MAX_ACTIVE_ASSIGNMENTS),
  });
  return rows.slice(0, repository.MAX_ACTIVE_ASSIGNMENTS);
};

const listSellableInventory = async (userId, query) => {
  const input = parse.parseQuery(query);
  if (input.errors.length > 0) throw errors.invalidInputError(input.errors);

  try {
    const agent = await repository.findAgentForUser(userId);
    if (!agent) throw errors.noApplicationError();
    const rows = await repository.findSellableAssignments(agent._id);
    const assignments = await boundedAssignments(agent._id, rows);
    const now = new Date();
    const groups = await Promise.all(assignments.map((assignment) => loadGroup(
      assignment,
      input.value,
      now,
    )));
    const kycStatus = effectiveKycStatus(agent);
    return {
      statusCode: 200,
      responseBody: mapper.toResponse({
        groups,
        kycStatus,
        kycCleared: hasVerifiedBadge(agent, kycStatus),
        ...input.value,
      }),
    };
  } catch (error) {
    mapDataError(error);
  }
};

module.exports = { listSellableInventory };
