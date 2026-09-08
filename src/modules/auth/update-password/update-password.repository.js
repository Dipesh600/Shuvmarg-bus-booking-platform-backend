'use strict';

const User = require('../../../../models/userModel');

const MAX_ATTEMPTS = 5;

const findByIdWithPassword = (userId) =>
  User.findById(userId).select('+password');

const recordFailedPasswordAttempt = (userId, lockUntilDate) =>
  User.findByIdAndUpdate(
    userId,
    [
      {
        $set: {
          failedLoginAttempts: { $add: ['$failedLoginAttempts', 1] },
          lockedUntil: {
            $cond: {
              if: { $gte: [{ $add: ['$failedLoginAttempts', 1] }, MAX_ATTEMPTS] },
              then: lockUntilDate,
              else: '$lockedUntil',
            },
          },
          tokenVersion: {
            $cond: {
              if: { $gte: [{ $add: ['$failedLoginAttempts', 1] }, MAX_ATTEMPTS] },
              then: { $add: ['$tokenVersion', 1] },
              else: '$tokenVersion',
            },
          },
        },
      },
    ],
    { new: true }
  );

const clearFailedPasswordState = (userId) =>
  User.findByIdAndUpdate(userId, {
    $set: { failedLoginAttempts: 0, lockedUntil: null },
  });

const updatePasswordHash = (userId, hashedPassword) =>
  User.findByIdAndUpdate(userId, {
    $set: { password: hashedPassword },
    $inc: { tokenVersion: 1, temporaryCredentialVersion: 1 },
  });

module.exports = {
  findByIdWithPassword,
  recordFailedPasswordAttempt,
  clearFailedPasswordState,
  updatePasswordHash,
};
