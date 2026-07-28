'use strict';

const mongoose = require('mongoose');
const User = require('../../../../../models/userModel');
const Agent = require('../../../../../models/agentModel');

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const findAgentBySetupId = async (id) => {
  let agent = null;
  if (isValidObjectId(id)) {
    agent = await Agent.findById(id);
  }
  if (!agent) {
    agent = await Agent.findOne({ agentId: id });
  }
  return agent;
};

const isValidLinkedOperatorId = (id) => isValidObjectId(id);

const activateUserForOperatorAgent = (userId) => (
  User.findByIdAndUpdate(userId, {
    isVerified: true,
    status: 'active',
  })
);

const saveAgent = (agent) => agent.save();

const findNotificationUser = (userId) => User.findById(userId).select('name phone');

module.exports = {
  findAgentBySetupId,
  isValidLinkedOperatorId,
  activateUserForOperatorAgent,
  saveAgent,
  findNotificationUser,
};
