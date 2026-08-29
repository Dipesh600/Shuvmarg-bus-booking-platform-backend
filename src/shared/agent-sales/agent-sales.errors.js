'use strict';

const AppError = require('../errors/app-error');

const error = (message, statusCode, extra = {}) => new AppError(
  message,
  statusCode,
  { success: false, message, ...extra },
);

const invalidInput = (errors) => error(
  errors[0] || 'The sales history request is not valid.', 400, { errors },
);
const notFound = () => error('Agent sales were not found.', 404, { errorCode: 'AGENT_SALES_NOT_FOUND' });
const noApplication = () => error('No agent application found.', 403, { errorCode: 'NO_APPLICATION' });

module.exports = { invalidInput, noApplication, notFound };
