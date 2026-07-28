'use strict';

const User = require('../../../../models/userModel');

exports.findUserByEmailOrPhone = async (emailOrPhone) => {
  return User.findOne({
    $or: [{ email: emailOrPhone }, { phone: emailOrPhone }],
  }).select('+password');
};

exports.incrementFailedAttempts = async (userId) => {
  return User.findByIdAndUpdate(
    userId,
    { $inc: { failedLoginAttempts: 1 } },
    { new: true }
  );
};

exports.lockAccount = async (userId, lockUntilDate) => {
  return User.findByIdAndUpdate(
    userId,
    { $set: { lockedUntil: lockUntilDate } }
  );
};

exports.recordSuccessfulLogin = async (userId, loginUpdate) => {
  return User.findByIdAndUpdate(userId, loginUpdate);
};
