'use strict';
const { getEffectiveRoles } = require('../../../../shared/auth/account-role.policy');

const OTP_PURPOSE = 'DRIVER_PASSWORD_RESET';
const MINIMUM_LATENCY_MS = 600;
const RECOVERY_STATES = Object.freeze({
  ELIGIBLE: 'ELIGIBLE',
  NOT_FOUND: 'NOT_FOUND',
  INVITED: 'INVITED',
  UNAVAILABLE: 'UNAVAILABLE',
});

const cleanOtp = (otp) => String(otp).replace(/\D/g, '');
const rolesFor = (user) => (getEffectiveRoles(user));
const recoveryState = (target) => {
  const user = target?.user;
  if (!user || user.deletedAt || !rolesFor(user).includes('driver') || !target.hasAnyProfile) {
    return RECOVERY_STATES.NOT_FOUND;
  }
  if (user.status === 'active' && target.hasActiveProfile) {
    return RECOVERY_STATES.ELIGIBLE;
  }
  if (user.status === 'invited' || target.hasInvitedProfile) {
    return RECOVERY_STATES.INVITED;
  }
  return RECOVERY_STATES.UNAVAILABLE;
};
const canRecoverPassword = (target) => recoveryState(target) === RECOVERY_STATES.ELIGIBLE;
const isOtpBlocked = (error) =>
  Boolean(error.message && error.message.startsWith('OTP_SEND_BLOCKED:'));
const isSmsDeliveryError = (error) =>
  Boolean(error.message && error.message.startsWith('Sparrow SMS Gateway Error:'));
const retryMinutes = (error) => parseInt(error.message.split(':')[1], 10) || 10;

module.exports = {
  OTP_PURPOSE,
  MINIMUM_LATENCY_MS,
  RECOVERY_STATES,
  cleanOtp,
  recoveryState,
  canRecoverPassword,
  isOtpBlocked,
  isSmsDeliveryError,
  retryMinutes,
};
