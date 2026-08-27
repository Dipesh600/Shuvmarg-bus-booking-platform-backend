'use strict';

const AppError = require('../../../shared/errors/app-error');

const make = (message, statusCode, errorCode, extra = {}) => new AppError(
  message,
  statusCode,
  { success: false, message, errorCode, ...extra },
);

module.exports = {
  conflict: () => make('This hold is already being committed.', 409, 'AGENT_SALE_CONFLICT'),
  dataConflict: () => make('The sale conflicts with stored data.', 409, 'AGENT_SALE_CONFLICT'),
  holdNotFound: () => make('Sale hold not found.', 404, 'SALE_HOLD_NOT_FOUND'),
  invalidInput: (errors) => make(errors[0], 400, 'INVALID_AGENT_SALE', { errors }),
  noApplication: () => make('No agent application found. Please complete your setup.', 403, 'NO_APPLICATION'),
  scopeChanged: () => make('The held trip no longer belongs to the authorized brand.', 409, 'SALE_SCOPE_CHANGED'),
  seatConflict: () => make('One or more held seats are no longer available.', 409, 'SEAT_UNAVAILABLE'),
};
