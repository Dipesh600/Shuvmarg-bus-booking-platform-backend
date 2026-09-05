'use strict';
const { getEffectiveRoles } = require('../../../../shared/auth/account-role.policy');

const OTP_PURPOSE = 'BUSOWNER_PASSWORD_RESET';
const MINIMUM_LATENCY_MS = 600;

const cleanOtp = (otp) => String(otp).replace(/\D/g, '');
const isSixDigitOtp = (otp) => cleanOtp(otp).length === 6;
const rolesFor = (user) => (getEffectiveRoles(user));
const hasBusOwnerRole = (user) => rolesFor(user).includes('busOwner');
const isSuspended = (user) => user.status === 'banned' || user.status === 'inactive';
const isOtpBlocked = (error) =>
  Boolean(error.message && error.message.startsWith('OTP_SEND_BLOCKED:'));
const retryMinutes = (error) => parseInt(error.message.split(':')[1], 10) || 10;
const isSparrowSmsError = (error) =>
  Boolean(error.message && error.message.includes('Sparrow SMS'));

module.exports = {
  OTP_PURPOSE,
  MINIMUM_LATENCY_MS,
  cleanOtp,
  isSixDigitOtp,
  rolesFor,
  hasBusOwnerRole,
  isSuspended,
  isOtpBlocked,
  retryMinutes,
  isSparrowSmsError,
};
