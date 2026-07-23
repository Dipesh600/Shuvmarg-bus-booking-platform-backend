'use strict';

const AGENT_PURPOSE = 'AGENT_REGISTRATION';
const NEPAL_MOBILE_RE = /^(97|98)\d{8}$/;
const OTP_WINDOW_MS = 30 * 60 * 1000;

const isValidNepalMobile = (phone) => NEPAL_MOBILE_RE.test(phone);
const cleanOtp = (otp) => String(otp).replace(/\D/g, '');
const rolesFor = (user) => (user.roles && user.roles.length > 0 ? user.roles : [user.role])
  .filter(Boolean);
const isOtpRecent = (otpRecord, nowMs) =>
  !(otpRecord.updatedAt < new Date(nowMs - OTP_WINDOW_MS));
const otpBlockedMinutes = (error) => parseInt(error.message.split(':')[1], 10) || 10;
const isOtpBlocked = (error) =>
  Boolean(error.message && error.message.startsWith('OTP_SEND_BLOCKED:'));
const isOtpCooldown = (error) =>
  Boolean(error.message && error.message.startsWith('OTP_COOLDOWN:'));
const otpCooldownSeconds = (error) => parseInt(error.message.split(':')[1], 10) || 60;
const normalizedEmail = (email) => email.toLowerCase().trim();
const newUserData = ({ name, phone, password, email, now }) => {
  const userData = {
    name: name.trim(),
    phone,
    password,
    role: 'agent',
    roles: ['agent'],
    status: 'active',
    phoneVerified: true,
    isVerified: false,
    roleActivatedAt: { agent: now },
  };
  if (email) userData.email = normalizedEmail(email);
  return userData;
};

module.exports = {
  AGENT_PURPOSE,
  OTP_WINDOW_MS,
  isValidNepalMobile,
  cleanOtp,
  rolesFor,
  isOtpRecent,
  otpBlockedMinutes,
  isOtpBlocked,
  isOtpCooldown,
  otpCooldownSeconds,
  normalizedEmail,
  newUserData,
};
