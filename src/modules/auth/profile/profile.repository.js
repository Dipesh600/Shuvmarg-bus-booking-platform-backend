'use strict';

const User = require('../../../../models/userModel');

const PROFILE_SELECT =
  '-password -__v -otp -otpExpiry -_id -referredBy -phone -role -isVerified -status -createdAt -updatedAt -rewardPoints -referralCode -referralPoints -totalReferrals -phoneVerified -yatrapoints';

const DETAIL_SELECT = '-password -__v -otp -otpExpiry -createdAt -updatedAt';

const findById = (userId) => User.findById(userId);

const saveProfilePicture = (user, profilePictureUrl) => {
  user.profilePicture = profilePictureUrl;
  return user.save({ validateBeforeSave: true });
};

const updateProfile = (userId, updateData) =>
  User.findByIdAndUpdate(userId, updateData, {
    new: true,
    runValidators: true,
    select: PROFILE_SELECT,
  });

const findByIdWithDetailProjection = (userId) =>
  User.findById(userId).select(DETAIL_SELECT);

module.exports = {
  PROFILE_SELECT,
  DETAIL_SELECT,
  findById,
  saveProfilePicture,
  updateProfile,
  findByIdWithDetailProjection,
};
