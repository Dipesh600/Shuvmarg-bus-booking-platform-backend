'use strict';

const AppError = require('../../../shared/errors/app-error');
const mapper = require('./driver-profile.mapper');
const repository = require('./driver-profile.repository');

const noProfile = () => new AppError(
  'No active Driver profile is linked to this account.',
  404,
  {
    success: false,
    message: 'No active Driver profile is linked to this account.',
    errorCode: 'DRIVER_PROFILE_NOT_FOUND',
  },
);

const conflictingProfiles = () => new AppError(
  'Multiple Driver profiles are linked to this account. Contact support.',
  409,
  {
    success: false,
    message: 'Multiple Driver profiles are linked to this account. Contact support.',
    errorCode: 'DRIVER_PROFILE_CONFLICT',
  },
);

const createDriverProfileService = ({ profileRepository = repository } = {}) => ({
  async getProfile(userId) {
    const profiles = await profileRepository.findLiveByUserId(userId);
    if (profiles.length === 0) throw noProfile();
    if (profiles.length !== 1) throw conflictingProfiles();
    return {
      statusCode: 200,
      responseBody: mapper.toResponse(profiles[0]),
    };
  },
});

module.exports = {
  createDriverProfileService,
  service: createDriverProfileService(),
};
