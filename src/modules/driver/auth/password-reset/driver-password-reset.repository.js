'use strict';

const User = require('../../../../../models/userModel');
const DriverProfile = require('../../../../../models/driverProfileModel');

const findRecoveryTargetByPhone = async (phone) => {
  const user = await User.findOne({ phone });
  if (!user) return null;
  const profiles = await DriverProfile.find({ userId: user._id })
    .select('accessStatus removedAt')
    .lean();
  return {
    user,
    hasAnyProfile: profiles.length > 0,
    hasActiveProfile: profiles.some(
      (profile) => profile.accessStatus === 'ACTIVE' && !profile.removedAt,
    ),
    hasInvitedProfile: profiles.some(
      (profile) => profile.accessStatus === 'INVITED' && !profile.removedAt,
    ),
  };
};

const completePasswordReset = ({ userId, hashedPassword }) =>
  User.findOneAndUpdate(
    {
      _id: userId,
      status: 'active',
      deletedAt: null,
      $or: [{ roles: 'driver' }, { role: 'driver', roles: { $exists: false } }],
    },
    {
      $set: {
        password: hashedPassword,
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

module.exports = { findRecoveryTargetByPhone, completePasswordReset };
