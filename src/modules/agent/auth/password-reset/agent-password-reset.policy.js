'use strict';
const { getEffectiveRoles } = require('../../../../shared/auth/account-role.policy');

const OTP_PURPOSE = 'AGENT_PASSWORD_RESET';
const MINIMUM_LATENCY_MS = 600;

const cleanOtp = (otp) => String(otp).replace(/\D/g, '');
const isSixDigitOtp = (otp) => cleanOtp(otp).length === 6;
const rolesFor = (user) => (getEffectiveRoles(user));
const hasAgentRole = (user) => rolesFor(user).includes('agent');
const canRecoverPassword = (user) => Boolean(
  user
  && !user.deletedAt
  && hasAgentRole(user)
  && (user.status === 'active' || user.status === 'invited'),
);
const isOtpBlocked = (error) =>
  Boolean(error.message && error.message.startsWith('OTP_SEND_BLOCKED:'));
const retryMinutes = (error) => parseInt(error.message.split(':')[1], 10) || 10;

module.exports = {
  OTP_PURPOSE,
  MINIMUM_LATENCY_MS,
  cleanOtp,
  isSixDigitOtp,
  rolesFor,
  hasAgentRole,
  canRecoverPassword,
  isOtpBlocked,
  retryMinutes,
};
