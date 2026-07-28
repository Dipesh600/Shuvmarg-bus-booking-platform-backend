'use strict';

const mongoose = require('mongoose');
const User = require('../../../../../models/userModel');
const Agent = require('../../../../../models/agentModel');

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const findUserById = (id) => User.findById(id);

const addAgentRoleToUser = (id) => (
  User.findByIdAndUpdate(id, {
    $addToSet: { roles: 'agent' },
    $set: { 'roleActivatedAt.agent': new Date() },
  })
);

const findAgentByUserId = (userId) => Agent.findOne({ user: userId });

const createAgentForUser = async (userId) => {
  const agent = new Agent({ user: userId });
  await agent.save();
  return agent;
};

module.exports = {
  isValidObjectId,
  findUserById,
  addAgentRoleToUser,
  findAgentByUserId,
  createAgentForUser,
};
