'use strict';

const mongoose = require('mongoose');
const User = require('../../../../models/userModel');
const Agent = require('../../../../models/agentModel');
const UserDeviceInfo = require('../../../../models/userDeviceInfoModel');

const findAgentForReview = async (id) => {
  let agent = null;
  if (id && mongoose.Types.ObjectId.isValid(id)) {
    agent = await Agent.findOne({ user: id });
    if (!agent) agent = await Agent.findById(id);
  }
  if (!agent && id) agent = await Agent.findOne({ agentId: id });
  return agent;
};

const saveAgent = (agent) => agent.save();

const updateUser = (userId, update) => User.findByIdAndUpdate(userId, update);

const findNotificationUser = (userId) => User.findById(userId).select('name email phone');

const findUserDevices = (userId) => UserDeviceInfo.find({ userId });

module.exports = {
  findAgentForReview,
  saveAgent,
  updateUser,
  findNotificationUser,
  findUserDevices,
};
