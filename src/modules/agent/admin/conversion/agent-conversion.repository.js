'use strict';

const mongoose = require('mongoose');
const User = require('../../../../../models/userModel');
const Agent = require('../../../../../models/agentModel');

const { withTransaction } = require('../../../../shared/auth/identity-transaction');
const { availableAccountFilter } = require('../../../../shared/auth/role-grant-state');

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const findUserById = (id, session) => User.findById(id).session(session || null);

const addAgentRoleToUser = (id, session) => (
  User.findOneAndUpdate(availableAccountFilter(id), {
    $addToSet: { roles: 'agent' },
    $set: { 'roleActivatedAt.agent': new Date() },
  }, { new: true, session })
);

const findAgentByUserId = (userId, session) => Agent.findOne({ user: userId }).session(session || null);

const createAgentForUser = async (userId, session) => {
  const agent = new Agent({ user: userId });
  await agent.save({ session });
  return agent;
};

module.exports = {
  withTransaction,
  isValidObjectId,
  findUserById,
  addAgentRoleToUser,
  findAgentByUserId,
  createAgentForUser,
};
