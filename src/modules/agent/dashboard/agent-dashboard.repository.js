'use strict';

const Agent = require('../../../../models/agentModel');

const findDashboardAgent = (userId) => Agent.findOne({ user: userId }).lean();

module.exports = {
  findDashboardAgent,
};
