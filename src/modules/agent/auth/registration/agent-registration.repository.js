'use strict';

const User = require('../../../../../models/userModel');
const Agent = require('../../../../../models/agentModel');
const OTP = require('../../../../../models/otpModel');

const findAgentIdByUser = (userId) => Agent.findOne({ user: userId }).select('_id').lean();

const findConsumedOtp = (phone) => OTP.findOne({
  phone,
  purpose: 'AGENT_REGISTRATION',
  isUsed: true,
});

const findUserByEmail = (email) => User.findOne({ email });

const upgradeUserToAgent = (userId, hashedPassword, activatedAt) => User.findByIdAndUpdate(
  userId,
  {
    $addToSet: {
      roles: 'agent',
    },
    $set: {
      'roleActivatedAt.agent': activatedAt,
      password: hashedPassword,
    },
  },
  {
    new: true,
  },
);

const createUser = async (userData) => {
  const user = new User(userData);
  return user.save();
};

const upsertAgentProfile = (userId) => Agent.findOneAndUpdate(
  {
    user: userId,
  },
  {
    $setOnInsert: {
      user: userId,
      applicationStatus: 'DRAFT',
    },
  },
  {
    upsert: true,
    new: true,
    setDefaultsOnInsert: true,
  },
);

module.exports = {
  findAgentIdByUser,
  findConsumedOtp,
  findUserByEmail,
  upgradeUserToAgent,
  createUser,
  upsertAgentProfile,
};
