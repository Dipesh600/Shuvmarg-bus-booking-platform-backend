"use strict";

const { FLEET_APPROVAL_STATUS } = require("../../contracts/status/fleet-approval.status");
const { FLEET_OPERATIONAL_STATUS } = require("../../contracts/status/fleet-operational.status");
const { isAssignmentSellable } = require("./agent-assignment-status");
const { ACCESS_SCOPES } = require("./agent-assignment-terms");

const idOf = (value) => String(value?._id || value || "");
const idSet = (values) => new Set((values || []).map(idOf));

/**
 * The single authorization predicate for agent inventory, intentionally pure so
 * the catalogue and the future seat-commit path can call the same decision.
 * Candidates must already carry their populated Buse in `busId`; restriction ids
 * only narrow rows that first prove brand ownership and fleet readiness.
 */
const filterSellableSchedules = ({ assignment, schedules }) => {
  if (!isAssignmentSellable(assignment?.status)) return [];

  const brandId = idOf(assignment.operatorId);
  const ownerId = idOf(assignment.ownerId);
  if (!brandId) return [];

  const allowedRoutes = idSet(assignment.allowedRouteIds);
  const allowedSchedules = idSet(assignment.allowedScheduleIds);

  return (schedules || []).filter((schedule) => {
    const bus = schedule?.busId;
    if (idOf(bus?.brandId) !== brandId) return false;
    // Secondary denormalisation check only. Brand equality above is what grants
    // scope; sharing an owner must never grant a sibling brand's inventory.
    if (ownerId && idOf(bus?.ownerId) !== ownerId) return false;
    if (bus?.approvalStatus !== FLEET_APPROVAL_STATUS.APPROVED) return false;
    if (bus?.status !== FLEET_OPERATIONAL_STATUS.ACTIVE) return false;
    if (schedule.isActive !== true) return false;

    if (assignment.accessScope === ACCESS_SCOPES.ALL_BUSES) return true;
    if (assignment.accessScope === ACCESS_SCOPES.ROUTES) {
      return allowedRoutes.has(idOf(schedule.routeId));
    }
    if (assignment.accessScope === ACCESS_SCOPES.SCHEDULES) {
      return allowedSchedules.has(idOf(schedule._id));
    }
    return false;
  });
};

module.exports = { filterSellableSchedules };
