"use strict";

const {
  updateForbiddenError,
  deleteForbiddenError,
  readForbiddenError,
} = require("./bus-owner-schedule.errors");

const FORBIDDEN_ERRORS = {
  update: updateForbiddenError,
  delete: deleteForbiddenError,
  read: readForbiddenError,
};

const assertOwnership = (schedule, operatorId, operation) => {
  if (schedule.operatorId.toString() !== operatorId) {
    const createError = FORBIDDEN_ERRORS[operation] || updateForbiddenError;
    throw createError();
  }
};

module.exports = {
  assertOwnership,
};
