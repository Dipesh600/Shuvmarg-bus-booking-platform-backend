'use strict';

const controller = require('./agent-password-reset.controller');

module.exports = {
  requestPasswordReset: controller.requestPasswordReset,
  verifyOtpForReset: controller.verifyOtpForReset,
  resetPassword: controller.resetPassword,
  resendOtpForReset: controller.resendOtpForReset,
};
