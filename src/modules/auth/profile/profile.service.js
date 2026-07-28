'use strict';

const AppError = require('../../../shared/errors/app-error');
const repository = require('./profile.repository');
const policy = require('./profile.policy');
const pictureService = require('./profile-picture.service');
const errors = require('./profile.errors');

const mapProfileError = (error) => {
  if (error instanceof AppError) throw error;
  if (error.http_code) throw errors.cloudinaryError(error);
  throw errors.internalError(error);
};

const buildUpdateData = (user, name, address, gender, profilePictureUrl) => {
  const updateData = {};
  if (name) updateData.name = name;
  if (address) updateData.address = address;
  if (gender) updateData.gender = gender.toLowerCase();
  if (profilePictureUrl !== user.profilePicture) {
    updateData.profilePicture = profilePictureUrl;
  }
  return updateData;
};

const updateProfilePicture = async ({ userId, profilePic }) => {
  try {
    policy.requireUser(userId);
    policy.requireProfilePicture(profilePic);
    policy.validateStandalonePicture(profilePic);
    const user = await repository.findById(userId);
    if (!user) throw errors.userNotFoundError();
    const result = await pictureService.uploadStandaloneProfilePicture(userId, profilePic);
    await repository.saveProfilePicture(user, result.secure_url);
    return {
      statusCode: 200,
      responseBody: { success: true, message: 'Profile picture updated successfully' },
    };
  } catch (error) {
    mapProfileError(error);
  }
};

const updateProfile = async ({ userId, name, address, gender, profilePic }) => {
  try {
    policy.requireUser(userId);
    const nameInput = policy.normalize(name);
    const addressInput = policy.normalize(address);
    const genderInput = policy.normalize(gender);
    policy.requireUpdateField(nameInput, addressInput, genderInput, profilePic);
    const user = await repository.findById(userId);
    if (!user) throw errors.userNotFoundError();
    policy.validateProfileFields(nameInput, addressInput, genderInput);
    let profilePictureUrl = user.profilePicture;
    if (profilePic) {
      policy.validateUpdatePicture(profilePic);
      try {
        const result = await pictureService.uploadProfileUpdatePicture(userId, profilePic);
        profilePictureUrl = result.secure_url;
      } catch (cloudinaryError) {
        throw errors.profileUploadFailedError(cloudinaryError);
      }
    }
    const updateData = buildUpdateData(user, nameInput, addressInput, genderInput, profilePictureUrl);
    const updatedUser = await repository.updateProfile(userId, updateData);
    return {
      statusCode: 200,
      responseBody: { status: true, message: 'Profile updated successfully', data: updatedUser },
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error.name === 'ValidationError') throw errors.validationError(error);
    if (error.http_code) throw errors.cloudinaryError(error);
    throw errors.internalError(error);
  }
};

const getUserDetail = async ({ userId }) => {
  try {
    policy.requireUser(userId);
    const user = await repository.findByIdWithDetailProjection(userId);
    if (!user) throw errors.userNotFoundError();
    const userObj = user.toObject();
    delete userObj.rewardPoints;
    delete userObj.referralPoints;
    return {
      statusCode: 200,
      responseBody: {
        status: true,
        message: 'User details fetched successfully',
        data: userObj,
      },
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw errors.internalError(error);
  }
};

module.exports = {
  updateProfilePicture,
  updateProfile,
  getUserDetail,
  buildUpdateData,
};
