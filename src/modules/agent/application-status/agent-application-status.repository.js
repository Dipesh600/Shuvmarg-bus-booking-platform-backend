'use strict';

const Agent = require('../../../../models/agentModel');

const findApplicationByUser = (userId) => Agent.findOne({ user: userId })
  .populate('user', 'name')
  .lean();

module.exports = {
  findApplicationByUser,
};
