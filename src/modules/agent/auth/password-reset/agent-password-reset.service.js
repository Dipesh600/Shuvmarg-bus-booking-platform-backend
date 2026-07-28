'use strict';

const requestService = require('./request-agent-password-reset.service');
const verifyService = require('./verify-agent-reset-otp.service');
const completeService = require('./complete-agent-password-reset.service');
const resendService = require('./resend-agent-reset-otp.service');
const policy = require('./agent-password-reset.policy');
const errors = require('./agent-password-reset.errors');

const mapOtpBlockedError = (error) => {
  if (policy.isOtpBlocked(error)) {
    throw errors.otpBlockedError(policy.retryMinutes(error));
  }
  throw error;
};

const requestPasswordReset = async (input) => {
  try {
    return await requestService.requestPasswordReset(input);
  } catch (error) {
    mapOtpBlockedError(error);
  }
};

const resendOtpForReset = async (input) => {
  try {
    return await resendService.resendOtpForReset(input);
  } catch (error) {
    mapOtpBlockedError(error);
  }
};

module.exports = {
  requestPasswordReset,
  verifyOtpForReset: verifyService.verifyOtpForReset,
  resetPassword: completeService.resetPassword,
  resendOtpForReset,
};
