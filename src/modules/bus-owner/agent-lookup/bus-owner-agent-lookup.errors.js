'use strict';

const AppError = require('../../../shared/errors/app-error');

const bodyError = (message, statusCode, extra = {}) => new AppError(
  message,
  statusCode,
  { success: false, message, ...extra },
);

/**
 * No agent holds this code.
 *
 * Returned for a malformed code as well as an unknown one, so the response never
 * distinguishes "not a real code" from "not a code in use". Well-formedness is
 * checkable offline against the checksum anyway, so the shared response costs
 * the caller nothing they could not already work out — but it keeps the two
 * paths from drifting apart into an oracle later.
 */
const agentNotFoundError = () => bodyError(
  'No agent found with that code. Check the code with your agent and try again.',
  404,
  { errorCode: 'AGENT_CODE_NOT_FOUND' },
);

/**
 * A real agent, but a platform-scope one, which an operator cannot assign
 * (master plan D7: the two scopes are disjoint — a platform agent sells any
 * operator's inventory under the platform's own arrangement, and an operator
 * cannot hire them on the side).
 *
 * This is deliberately distinct from a 404, which does confirm the code exists.
 * That is an acceptable trade: codes are published by their holders, the space
 * is 32^6 behind a checksum, and the endpoint is rate-limited per owner — so
 * this is not the weak point in enumeration. Collapsing it into a 404 would
 * instead leave an operator retyping a code that will never work, with nothing
 * telling them why.
 */
const agentNotAssignableError = () => bodyError(
  'This agent sells for the platform directly and cannot be added to an operator.',
  409,
  { errorCode: 'AGENT_NOT_ASSIGNABLE' },
);

module.exports = {
  agentNotAssignableError,
  agentNotFoundError,
  bodyError,
};
