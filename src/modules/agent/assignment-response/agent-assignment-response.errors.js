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

const noApplicationError = () => bodyError(
  'No agent application found. Please complete your setup.',
  403,
  { errorCode: 'NO_APPLICATION', applicationStatus: null },
);

const inviteExpiredError = () => bodyError(
  'This assignment invitation has expired.',
  409,
  { errorCode: 'INVITE_EXPIRED' },
);

const assignmentStateError = (status) => bodyError(
  'This assignment invitation can no longer be answered.',
  409,
  { errorCode: 'ASSIGNMENT_NOT_INVITED', assignmentStatus: status || null },
);

const invalidInputError = (messages) => bodyError(
  messages[0] || 'The response details are not valid.',
  400,
  { errors: messages },
);

const assignmentConflictError = () => bodyError(
  'The assignment response conflicts with another update.',
  409,
  { errorCode: 'ASSIGNMENT_CONFLICT' },
);

module.exports = {
  assignmentConflictError,
  assignmentNotFoundError,
  assignmentStateError,
  invalidInputError,
  inviteExpiredError,
  noApplicationError,
};
