"use strict";

class ScheduleError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

const emptyBodyError = () =>
  new ScheduleError(400, "your body is empty please add");

const missingFieldsError = () =>
  new ScheduleError(400, "Missing required fields.");

const notFoundError = () =>
  new ScheduleError(404, "Ticket not found.");

const updateForbiddenError = () =>
  new ScheduleError(403, "Unauthorized to update this ticket.");

const deleteForbiddenError = () =>
  new ScheduleError(403, "Unauthorized to delete this ticket.");

const readForbiddenError = () =>
  new ScheduleError(403, "Unauthorized to get ticket!");

module.exports = {
  ScheduleError,
  emptyBodyError,
  missingFieldsError,
  notFoundError,
  updateForbiddenError,
  deleteForbiddenError,
  readForbiddenError,
};
