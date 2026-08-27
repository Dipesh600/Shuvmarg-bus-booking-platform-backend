'use strict';

const controller = require('./agent-assignment-response.controller');

module.exports = {
  acceptAssignment: controller.acceptAssignment,
  declineAssignment: controller.declineAssignment,
};
