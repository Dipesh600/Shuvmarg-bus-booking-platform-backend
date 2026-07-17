'use strict';

const controller = require('./profile.controller');

module.exports = {
  updateProfilePicture: controller.updateProfilePicture,
  updateProfile: controller.updateProfile,
  getUserDetail: controller.getUserDetail,
};
