'use strict';

const User = require('../../../../models/userModel');

const findByIdWithPassword = (userId) =>
  User.findById(userId).select(
    '+password +temporaryCredentialExpiresAt +temporaryCredentialVersion'
  );

const saveForcedPasswordChange = async (user, hashedPassword, options = {}) => {
  if (!Number.isInteger(options.credentialVersion) || options.credentialVersion < 0
    || !Number.isInteger(options.tokenVersion) || options.tokenVersion < 0
    || typeof options.activeRole !== 'string') return null;
  const versionFilter = (field, version) => version === 0
    ? { $or: [{ [field]: 0 }, { [field]: { $exists: false } }] }
    : { [field]: version };
  const query = {
    _id: user._id, forcePasswordChange: true, status: 'active', deletedAt: null,
    $and: [
      versionFilter('temporaryCredentialVersion', options.credentialVersion),
      versionFilter('tokenVersion', options.tokenVersion),
      { $or: [{ temporaryCredentialExpiresAt: null },
        { temporaryCredentialExpiresAt: { $gt: new Date() } }] },
      { $or: [{ roles: options.activeRole },
        { roles: { $exists: false }, role: options.activeRole }] },
    ],
  };
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
