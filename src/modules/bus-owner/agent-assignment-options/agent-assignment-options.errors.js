'use strict';

const AppError = require('../../../shared/errors/app-error');

const make = (message, statusCode, errorCode, extra = {}) => new AppError(
  message,
  statusCode,
  { success: false, message, errorCode, ...extra },
);

module.exports = {
  brandNotFound: () => make('Operator brand not found.', 404, 'OPERATOR_BRAND_NOT_FOUND'),
  invalidInput: (errors) => make(errors[0], 400, 'INVALID_ASSIGNMENT_OPTIONS', { errors }),
};
