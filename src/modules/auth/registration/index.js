'use strict';

const registrationController = require('./registration.controller');

module.exports = {
  sendPhoneOTP: registrationController.sendPhoneOTP,
  verifyPhoneOTP: registrationController.verifyPhoneOTP,
  completeRegistration: registrationController.completeRegistration,
};
