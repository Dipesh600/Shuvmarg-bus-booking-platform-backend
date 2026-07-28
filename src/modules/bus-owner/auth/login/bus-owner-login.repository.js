'use strict';

const User = require('../../../../../models/userModel');

const LOGIN_SELECTION = '+password failedLoginAttempts lockedUntil status roles role '
  + 'forcePasswordChange suspensionReason suspendedAt';

const findLoginUser = (normalizedPhone, rawPhone) => User.findOne({
  $or: [
    { phone: normalizedPhone },
    { phone: rawPhone },
  ],
  deletedAt: null,
}).select(LOGIN_SELECTION);

const incrementFailedLoginAttempts = (userId) => User.findByIdAndUpdate(
  userId,
  {
    $inc: {
      failedLoginAttempts: 1,
    },
  },
  {
    new: true,
  },
);

const lockAccount = (userId, lockedUntil) => User.findByIdAndUpdate(
  userId,
  {
    $set: {
      lockedUntil,
    },
  },
);

const resetLoginSecurityState = (userId, lastLoginAt) => User.findByIdAndUpdate(
  userId,
  {
    $set: {
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt,
    },
  },
);

module.exports = {
  LOGIN_SELECTION,
  findLoginUser,
  incrementFailedLoginAttempts,
  lockAccount,
  resetLoginSecurityState,
};
