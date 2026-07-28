'use strict';

const Agent = require('../../../../models/agentModel');

const findProfileAgent = (userId) => Agent.findOne({ user: userId })
  .populate('linkedOperatorId', 'brandName logo brandCode')
  .lean();

module.exports = {
  findProfileAgent,
};
