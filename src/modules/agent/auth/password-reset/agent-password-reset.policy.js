'use strict';

const OTP_PURPOSE = 'AGENT_PASSWORD_RESET';
const MINIMUM_LATENCY_MS = 600;

const cleanOtp = (otp) => String(otp).replace(/\D/g, '');
const isSixDigitOtp = (otp) => cleanOtp(otp).length === 6;
const rolesFor = (user) => (user.roles && user.roles.length > 0 ? user.roles : [user.role]);
const hasAgentRole = (user) => rolesFor(user).includes('agent');
const isSuspended = (user) => user.status === 'banned' || user.status === 'inactive';
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
  isSuspended,
  isOtpBlocked,
  retryMinutes,
};
