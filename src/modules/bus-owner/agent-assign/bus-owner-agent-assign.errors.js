'use strict';

const AppError = require('../../../shared/errors/app-error');

const bodyError = (message, statusCode, extra = {}) => new AppError(
  message,
  statusCode,
  { success: false, message, ...extra },
);

/**
 * The first complaint becomes the message, the rest ride along in `errors`. The
 * fallback is not decoration: a mongoose ValidationError can arrive with an empty
 * `errors` map, and a 400 whose message is `undefined` tells the caller nothing.
 */
const invalidInputError = (errors) => bodyError(
  errors[0] || 'The assignment details are not valid.',
  400,
  { errors },
);

/**
 * Same wording as the invite endpoint: an owner who names a brand that is not
 * theirs is told it is not theirs, and nothing about whose it is.
 */
const brandNotOwnedError = () => bodyError('You do not own this brand.', 403);

/**
 * A live assignment for this pair already exists. Raised from the duplicate-key
 * error on the partial unique index, not from a prior read — the index is what
 * actually settles the race between two operators clicking Invite at once, and a
 * check-then-insert would just be a slower way to reach the same 409 with a
 * window in the middle.
 *
 * INVITED, ACTIVE and SUSPENDED all count as live, so this covers "already
 * invited", "already working for you" and "you suspended them". The message says
 * which by naming the status rather than guessing.
 */
const assignmentExistsError = (status) => bodyError(
  'This agent already has an assignment with this brand.',
  409,
  { errorCode: 'ASSIGNMENT_ALREADY_EXISTS', assignmentStatus: status || null },
);

module.exports = {
  assignmentExistsError,
  bodyError,
  brandNotOwnedError,
  invalidInputError,
};
