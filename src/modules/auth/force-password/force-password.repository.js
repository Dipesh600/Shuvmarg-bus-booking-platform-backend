'use strict';

const User = require('../../../../models/userModel');

const findByIdWithPassword = (userId) =>
  User.findById(userId).select('+password');

const saveForcedPasswordChange = async (user, hashedPassword) => {
  user.password = hashedPassword;
  user.forcePasswordChange = false;
  user.phoneVerified = true;
  return user.save();
};

const incrementTokenVersion = (userId) =>
  User.findByIdAndUpdate(userId, { $inc: { tokenVersion: 1 } });

const findFreshUser = (userId) =>
  User.findById(userId);

module.exports = {
  findByIdWithPassword,
  saveForcedPasswordChange,
  incrementTokenVersion,
  findFreshUser,
};
