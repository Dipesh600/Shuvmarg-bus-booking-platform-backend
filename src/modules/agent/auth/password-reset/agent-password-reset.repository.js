'use strict';

const User = require('../../../../../models/userModel');

const findUserByPhone = (phone) => User.findOne({ phone });
const completePasswordReset = ({ userId, expectedStatus, hashedPassword }) =>
  User.findOneAndUpdate(
    {
      _id: userId,
      status: expectedStatus,
      deletedAt: null,
      $or: [{ roles: 'agent' }, { role: 'agent', roles: { $size: 0 } }],
    },
    {
      $set: {
        password: hashedPassword,
        status: 'active',
        isVerified: true,
        phoneVerified: true,
        failedLoginAttempts: 0,
        lockedUntil: null,
        forcePasswordChange: false,
        temporaryCredentialIssuedAt: null,
        temporaryCredentialExpiresAt: null,
        temporaryCredentialIssuedBy: null,
      },
      $inc: { tokenVersion: 1, temporaryCredentialVersion: 1 },
    },
    { new: true, runValidators: true },
  );

module.exports = {
  findUserByPhone,
  completePasswordReset,
};
