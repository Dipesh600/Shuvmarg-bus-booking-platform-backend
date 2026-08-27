'use strict';

const AppError = require('../../../shared/errors/app-error');

const bodyError = (message, statusCode, extra = {}) => new AppError(
  message,
  statusCode,
  { success: false, message, ...extra },
);

const assignmentNotFoundError = () => bodyError(
  'Assignment not found.',
  404,
  { errorCode: 'ASSIGNMENT_NOT_FOUND' },
);

const assignmentStateError = (status) => bodyError(
  'This assignment cannot perform that action from its current status.',
  409,
  { errorCode: 'ASSIGNMENT_STATE_CONFLICT', assignmentStatus: status || null },
);

const invalidInputError = (messages) => bodyError(
  messages[0] || 'The assignment request is not valid.',
  400,
  { errors: messages },
);

const assignmentConflictError = () => bodyError(
  'The assignment conflicts with another update.',
  409,
  { errorCode: 'ASSIGNMENT_CONFLICT' },
);

module.exports = {
  assignmentConflictError,
  assignmentNotFoundError,
  assignmentStateError,
  invalidInputError,
};
