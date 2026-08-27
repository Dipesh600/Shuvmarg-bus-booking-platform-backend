'use strict';

const { effectiveKycStatus, hasVerifiedBadge } = require('../../../shared/identity/agent-assignability');
const { filterSellableSchedules } = require('../../../shared/identity/agent-selling-guard');
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

const attachBuses = (schedules, buses) => {
  const byId = new Map(buses.map((bus) => [String(bus._id), bus]));
  return schedules.map((schedule) => ({
    ...schedule,
    busId: byId.get(String(schedule.busId)) || schedule.busId,
  }));
};

const loadGroup = async (assignment, pagination) => {
  const buses = await repository.findApprovedBusesForAssignment(assignment);
  if (buses.length === 0) return { assignment, schedules: [], fareRules: [], hasMore: false };

  const candidates = await repository.findSchedulesForBuses(
    buses.map((bus) => bus._id),
    pagination,
  );
  const hasMore = candidates.length > pagination.limit;
  const populated = attachBuses(candidates.slice(0, pagination.limit), buses);
  const schedules = filterSellableSchedules({ assignment, schedules: populated });
  const fareRules = schedules.length === 0 ? [] : await repository.findFareRulesForSchedules(
    assignment.ownerId,
    schedules,
  );
  return { assignment, schedules, fareRules, hasMore };
};

const listSellableInventory = async (userId, query) => {
  const input = parse.parseQuery(query);
  if (input.errors.length > 0) throw errors.invalidInputError(input.errors);

  try {
    const agent = await repository.findAgentForUser(userId);
    if (!agent) throw errors.noApplicationError();
    const assignments = await repository.findSellableAssignments(agent._id);
    const groups = await Promise.all(assignments.map((assignment) => loadGroup(
      assignment,
      input.value,
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
