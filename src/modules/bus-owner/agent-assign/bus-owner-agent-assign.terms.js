'use strict';

const {
  ACCESS_SCOPES,
  DEFAULT_PERMISSIONS,
  isAccessScope,
  isCommissionValid,
} = require('../../../shared/identity/agent-assignment-terms');
const { parseIdList, parseNumber } = require('./bus-owner-agent-assign.parse');

const BOOLEAN_PERMISSIONS = Object.freeze(['canSellCash', 'canSellOnline', 'canCancel']);

/**
 * How much of the operator's inventory the assignment opens up.
 *
 * The lists NARROW; they do not grant. A schedule id from another operator can
 * only intersect with "inventory this operator holds" to produce nothing, which
 * is why they are not ownership-checked here — the selling guard is the
 * authorisation boundary and must compute that intersection itself. Anything
 * that reads these lists as a grant is reading them wrong.
 *
 * Sending a list the chosen scope does not use is an error rather than a silent
 * drop: an operator who sends routes alongside ALL_BUSES believes they have
 * narrowed the access, and quietly ignoring the list would leave them believing
 * it.
 */
const parseAccess = (source, errors) => {
  const raw = typeof source.accessScope === 'string' ? source.accessScope.trim().toUpperCase() : null;
  const accessScope = raw || ACCESS_SCOPES.ALL_BUSES;
  if (!isAccessScope(accessScope)) errors.push('accessScope is not a recognised access scope.');

  const supplied = {
    allowedRouteIds: parseIdList(source.allowedRouteIds, 'allowedRouteIds', errors),
    allowedScheduleIds: parseIdList(source.allowedScheduleIds, 'allowedScheduleIds', errors),
  };

  const wanted = {
    [ACCESS_SCOPES.ROUTES]: 'allowedRouteIds',
    [ACCESS_SCOPES.SCHEDULES]: 'allowedScheduleIds',
  }[accessScope] || null;

  for (const field of Object.keys(supplied)) {
    if (field === wanted && supplied[field].length === 0) {
      errors.push(`${field} is required when accessScope is ${accessScope}.`);
    }
    if (field !== wanted && supplied[field].length > 0) {
      errors.push(`${field} cannot be set when accessScope is ${accessScope}.`);
    }
  }

  return { accessScope, ...supplied };
};

/**
 * What the agent may do with the access.
 *
 * Only known keys are read, so an unknown key in the body cannot become a stored
 * permission. Absent keys are left absent rather than defaulted here — the schema
 * owns the defaults, and writing them again in the request layer is how the two
 * lists start to disagree.
 */
const parsePermissions = (input, errors) => {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const permissions = {};

  for (const key of BOOLEAN_PERMISSIONS) {
    if (source[key] === undefined) continue;
    if (typeof source[key] !== 'boolean') errors.push(`permissions.${key} must be true or false.`);
    else permissions[key] = source[key];
  }

  const numbers = {
    cancelWindowMins: parseNumber(source, 'cancelWindowMins', errors, { min: 0 }),
    maxSeatsPerBooking: parseNumber(source, 'maxSeatsPerBooking', errors, { min: 1, nullable: true }),
    maxDiscountPct: parseNumber(source, 'maxDiscountPct', errors, { integer: false, min: 0, max: 100 }),
  };
  for (const [key, value] of Object.entries(numbers)) {
    if (value !== undefined) permissions[key] = value;
  }

  // A cancellation window on an agent who may not cancel describes a permission
  // that does not exist. Refused rather than zeroed, because an operator who set
  // a window meant to grant one.
  const canCancel = permissions.canCancel ?? DEFAULT_PERMISSIONS.canCancel;
  if (!canCancel && permissions.cancelWindowMins > 0) {
    errors.push('permissions.cancelWindowMins requires permissions.canCancel to be true.');
  }

  return permissions;
};

/** Absent commission is left absent so the schema default (PERCENT/0) applies. */
const parseCommission = (input, errors) => {
  if (input === undefined || input === null) return undefined;
  if (typeof input !== 'object' || Array.isArray(input)) {
    errors.push('commission must be an object with a mode and a value.');
    return undefined;
  }
  const mode = typeof input.mode === 'string' ? input.mode.trim().toUpperCase() : null;
  if (!isCommissionValid(mode, input.value)) {
    errors.push('commission mode or value is out of range.');
    return undefined;
  }
  return { mode, value: input.value };
};

module.exports = {
  parseAccess,
  parseCommission,
  parsePermissions,
};
