'use strict';

const controller = require('./agent-directory.controller');

module.exports = {
  getAgentsById: controller.getAgentsById,
  getAllAgents: controller.getAllAgents,
};
