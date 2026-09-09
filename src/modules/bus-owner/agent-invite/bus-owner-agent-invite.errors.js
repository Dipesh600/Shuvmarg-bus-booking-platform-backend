'use strict';

const AppError = require('../../../shared/errors/app-error');

const bodyError = (message, statusCode, extra = {}) => new AppError(
  message,
  statusCode,
  { success: false, message, ...extra },
);

const invalidInputError = (errors) => bodyError(errors[0], 400, { errors });

const invalidPhoneError = () => bodyError('Please enter a valid Nepal mobile number.', 400);

const brandNotOwnedError = () => bodyError('You do not own this brand.', 403);
const agentNotFoundError = () => bodyError('Agent invitation not found.', 404);
const activationUnavailableError = () => bodyError(
  'This agent account is already active or cannot be activated here.', 409,
  { errorCode: 'AGENT_ACTIVATION_UNAVAILABLE' },
);

/**
 * The phone already holds the agent role. Note what this does NOT do: it does
 * not tell the owner whose account it is, or return the existing agent's code.
 * An owner could otherwise enumerate phone numbers to discover which belong to
 * agents on the platform, and agent codes are meant to be shared by the agent,
 * not harvested by whoever guesses their number.
 */
const alreadyAgentError = () => bodyError(
  'This mobile number is already registered as an agent. Ask them for their agent code instead.',
  409,
  { errorCode: 'ROLE_ALREADY_REGISTERED' },
);

const duplicateKeyError = (error) => {
  const field = Object.keys(error.keyPattern || {})[0];
  if (field === 'user') {
    return bodyError(
      'An agent profile for this phone number already exists.',
      409,
      { errorCode: 'AGENT_ALREADY_EXISTS' },
    );
  }
  return bodyError(
    field === 'phone'
      ? 'Mobile number is already registered.'
      : 'This information is already registered with another account.',
    409,
  );
};

module.exports = {
  activationUnavailableError,
  agentNotFoundError,
  alreadyAgentError,
  bodyError,
  brandNotOwnedError,
  duplicateKeyError,
  invalidInputError,
  invalidPhoneError,
};
