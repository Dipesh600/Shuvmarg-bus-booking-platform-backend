'use strict';

const controller = require('./agent-registration.controller');

module.exports = {
  sendOTP: controller.sendOTP,
  verifyOTP: controller.verifyOTP,
  register: controller.register,
  resendOTP: controller.resendOTP,
};
