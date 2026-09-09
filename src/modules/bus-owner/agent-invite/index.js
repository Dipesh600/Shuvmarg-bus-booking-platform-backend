'use strict';

const controller = require('./bus-owner-agent-invite.controller');

module.exports = {
  createAgent: controller.createAgent,
  getAgentInvitationStatus: controller.getAgentInvitationStatus,
  resendAgentInvitation: controller.resendAgentInvitation,
};
