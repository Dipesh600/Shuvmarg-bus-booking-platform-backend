'use strict';

const controller = require('./bus-owner-agent-assignment-lifecycle.controller');

module.exports = {
  listAssignments: controller.listAssignments,
  reinstateAssignment: controller.reinstateAssignment,
  revokeAssignment: controller.revokeAssignment,
  suspendAssignment: controller.suspendAssignment,
};
