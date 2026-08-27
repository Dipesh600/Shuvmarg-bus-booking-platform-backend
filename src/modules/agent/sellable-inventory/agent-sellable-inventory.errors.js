'use strict';

const AppError = require('../../../shared/errors/app-error');

const bodyError = (message, statusCode, extra = {}) => new AppError(
  message,
  statusCode,
  { success: false, message, ...extra },
);

const noApplicationError = () => bodyError(
  'No agent application found. Please complete your setup.',
  403,
  { errorCode: 'NO_APPLICATION', applicationStatus: null },
);

const invalidInputError = (messages) => bodyError(
  messages[0] || 'The inventory request is not valid.',
  400,
  { errors: messages },
);

const inventoryConflictError = () => bodyError(
  'The inventory request conflicts with stored data.',
  409,
  { errorCode: 'INVENTORY_CONFLICT' },
);

module.exports = {
  invalidInputError,
  inventoryConflictError,
  noApplicationError,
};
