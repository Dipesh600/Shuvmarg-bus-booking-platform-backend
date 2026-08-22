'use strict';

const User = require('../../../../models/userModel');

const findByIdWithPassword = (userId) =>
  User.findById(userId).select(
    '+password +temporaryCredentialExpiresAt +temporaryCredentialVersion'
  );

const saveForcedPasswordChange = async (user, hashedPassword, options = {}) => {
  const query = { _id: user._id, forcePasswordChange: true };
  if (Number.isInteger(options.credentialVersion)) {
    query.temporaryCredentialVersion = options.credentialVersion;
  }
  const set = {
    password: hashedPassword,
    forcePasswordChange: false,
    temporaryCredentialIssuedAt: null,
    temporaryCredentialExpiresAt: null,
    temporaryCredentialIssuedBy: null,
    "accessNotification.status": "DELIVERED",
  };
  if (options.phoneVerified === true) set.phoneVerified = true;
  return User.findOneAndUpdate(query, {
    $set: set,
    $inc: { temporaryCredentialVersion: 1, tokenVersion: 1 },
  }, { new: true });
};

const findFreshUser = (userId) =>
  User.findById(userId);

module.exports = {
  findByIdWithPassword,
  saveForcedPasswordChange,
  findFreshUser,
};
