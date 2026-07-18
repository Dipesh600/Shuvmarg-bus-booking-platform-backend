'use strict';

const phoneGuard = require('../../../../../utils/phoneGuard');
const otpService = require('./agent-registration-otp.service');
const completionService = require('./agent-registration-completion.service');
const policy = require('./agent-registration.policy');
const errors = require('./agent-registration.errors');

const mapOtpError = (error) => {
  if (policy.isOtpBlocked(error)) {
    throw errors.otpSendBlockedError(policy.otpBlockedMinutes(error));
  }
  throw error;
};

const sendOTP = async ({ rawPhone }) => {
  try {
    return await otpService.sendOTP({
      phone: phoneGuard.normalizePhone(rawPhone),
    });
  } catch (error) {
    mapOtpError(error);
  }
};

const verifyOTP = async ({ rawPhone, otp }) => otpService.verifyOTP({
  phone: phoneGuard.normalizePhone(rawPhone),
  otp,
});

const register = async (input) => completionService.register({
  ...input,
  phone: phoneGuard.normalizePhone(input.rawPhone),
});

const resendOTP = async ({ rawPhone }) => {
  try {
    return await otpService.resendOTP({
      phone: phoneGuard.normalizePhone(rawPhone),
    });
  } catch (error) {
    mapOtpError(error);
  }
};

module.exports = {
  sendOTP,
  verifyOTP,
  register,
  resendOTP,
};
