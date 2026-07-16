'use strict';

const controller = require('./password-reset.controller');

module.exports = {
  requestPasswordReset: controller.requestPasswordReset,
  verifyOtpForReset: controller.verifyOtpForReset,
  resetPassword: controller.resetPassword,
};
