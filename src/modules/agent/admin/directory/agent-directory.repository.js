'use strict';

const mongoose = require('mongoose');
const User = require('../../../../../models/userModel');
const Agent = require('../../../../../models/agentModel');

const selectPublicUser = (id) => User.findById(id).select('-password -__v');

const findAgentDetailsById = async (id) => {
  let user = null;
  let agent = null;

  if (mongoose.Types.ObjectId.isValid(id)) {
    agent = await Agent.findOne({ user: id });
    if (agent) {
      user = await selectPublicUser(id);
    } else {
      agent = await Agent.findById(id);
      if (agent) user = await selectPublicUser(agent.user);
    }
  }

  if (!agent) {
    agent = await Agent.findOne({ agentId: id });
    if (agent) user = await selectPublicUser(agent.user);
  }

  return { agent, user };
};

const listAgents = (filter) => (
  Agent.find(filter)
    .populate('user', 'name email phone profilePicture status')
    .populate('linkedOperatorId', 'brandName brandCode')
    .sort({ createdAt: -1 })
    .lean()
);

module.exports = {
  findAgentDetailsById,
  listAgents,
};
