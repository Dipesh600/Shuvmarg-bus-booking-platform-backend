'use strict';

const User = require('../../../../../models/userModel');
const Agent = require('../../../../../models/agentModel');
const OTP = require('../../../../../models/otpModel');
const { availableAccountFilter } = require('../../../../shared/auth/role-grant-state');

const findAgentIdByUser = (userId) => Agent.findOne({ user: userId }).select('_id').lean();

const findConsumedOtp = (phone) => OTP.findOne({
  phone,
  purpose: 'AGENT_REGISTRATION',
  isUsed: true,
});

const findUserByEmail = (email) => User.findOne({ email });

const hasUsablePassword = userId => User.exists({ _id: userId,
  password: { $exists: true, $type: 'string', $ne: '' } }).then(Boolean);

const upgradeUserToAgent = (userId, hashedPassword, activatedAt) => User.findOneAndUpdate(
  { ...availableAccountFilter(userId),
    ...(hashedPassword ? { $or: [{ password: null }, { password: '' }] }
      : { password: { $exists: true, $type: 'string', $ne: '' } }) },
  {
    $addToSet: {
      roles: 'agent',
    },
    $set: {
      'roleActivatedAt.agent': activatedAt,
      ...(hashedPassword ? { password: hashedPassword } : {}),
    },
    ...(hashedPassword ? { $inc: { tokenVersion: 1 } } : {}),
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
  hasUsablePassword,
  upgradeUserToAgent,
  createUser,
  upsertAgentProfile,
};
