"use strict";

/**
 * The operator-facing wire shape for assignment terms. Both invite creation and
 * lifecycle reads use this one allowlist so a schema addition cannot silently
 * appear in only one response or leak through a document spread.
 */
const toAssignmentTerms = (assignment) => ({
  access: {
    accessScope: assignment.accessScope,
    allowedRouteIds: (assignment.allowedRouteIds || []).map(String),
    allowedScheduleIds: (assignment.allowedScheduleIds || []).map(String),
  },
  permissions: {
    canSellCash: assignment.permissions?.canSellCash,
    canSellOnline: assignment.permissions?.canSellOnline,
    canCancel: assignment.permissions?.canCancel,
    cancelWindowMins: assignment.permissions?.cancelWindowMins,
    maxSeatsPerBooking: assignment.permissions?.maxSeatsPerBooking ?? null,
    maxDiscountPct: assignment.permissions?.maxDiscountPct,
  },
  commission: {
    mode: assignment.operatorCommission?.mode,
    value: assignment.operatorCommission?.value,
  },
});

module.exports = { toAssignmentTerms };
