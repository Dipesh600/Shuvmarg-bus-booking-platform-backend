'use strict';

const AppError = require('../../../shared/errors/app-error');

const make = (message, statusCode, errorCode, extra = {}) => new AppError(
  message,
  statusCode,
  { success: false, message, errorCode, ...extra },
);

module.exports = {
  agentNotVerified: () => make('Complete agent verification before starting a sale.', 403, 'AGENT_NOT_VERIFIED'),
  invalidInput: (errors) => make(errors[0] || 'The hold request is invalid.', 400, 'INVALID_AGENT_HOLD', { errors }),
  noApplication: () => make('No agent application found. Please complete your setup.', 403, 'NO_APPLICATION'),
  notSellable: () => make('This trip is not sellable under an active assignment.', 403, 'NOT_SELLABLE_INVENTORY'),
  seatUnavailable: (message) => make(message, 409, 'SEAT_UNAVAILABLE'),
};
