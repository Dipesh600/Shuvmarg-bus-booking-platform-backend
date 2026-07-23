'use strict';

const BUS_OWNER_PURPOSE = 'BUSOWNER_REGISTRATION';
const OTP_WINDOW_MS = 30 * 60 * 1000;
const NEPAL_MOBILE_RE = /^(97|98)\d{8}$/;

const isValidNepalMobile = (phone) => NEPAL_MOBILE_RE.test(phone);
const cleanOtp = (otp) => String(otp).replace(/\D/g, '');
const isSixDigitOtp = (otp) => otp.length === 6;
const isOtpRecent = (otpRecord, nowMs) =>
  !(otpRecord.updatedAt < new Date(nowMs - OTP_WINDOW_MS));
const isOtpBlocked = (error) =>
  Boolean(error.message && error.message.startsWith('OTP_SEND_BLOCKED:'));
const otpBlockedMinutes = (error) => parseInt(error.message.split(':')[1], 10) || 10;
const isOtpCooldown = (error) =>
  Boolean(error.message && error.message.startsWith('OTP_COOLDOWN:'));
const otpCooldownSeconds = (error) => parseInt(error.message.split(':')[1], 10) || 60;
const missingRegistrationField = ({ phone, name, companyName }) => {
  if (!phone) return 'Phone';
  if (!name) return 'Name';
  if (!companyName) return 'Company name';
  return null;
};
const hasShortName = (name) => name.trim().length < 3;
const hasShortCompanyName = (companyName) => companyName.trim().length < 3;
const normalizedEmail = (email) => email.toLowerCase().trim();
const duplicateKeyMessage = (error) => {
  const field = Object.keys(error.keyPattern || {})[0];
  const label = field === 'phone' ? 'Mobile number' : field === 'email' ? 'Email' : 'Value';
  return `${label} is already registered.`;
};
const successMessage = (isUpgrade) => (isUpgrade
  ? 'Bus operator role added. Submit your KYC documents to activate your account.'
  : 'Registration successful. Submit your KYC documents to activate your account.');
const newUserData = ({ phone, name, password, email, address, now }) => {
  const userData = {
    name: name.trim(),
    phone,
    password,
    role: 'busOwner',
    roles: ['busOwner'],
    status: 'active',
    phoneVerified: true,
    isVerified: false,
    roleActivatedAt: { busOwner: now },
  };
  if (email) userData.email = normalizedEmail(email);
  if (address) userData.address = address.trim();
  return userData;
};

module.exports = {
  BUS_OWNER_PURPOSE,
  OTP_WINDOW_MS,
  isValidNepalMobile,
  cleanOtp,
  isSixDigitOtp,
  isOtpRecent,
  isOtpBlocked,
  otpBlockedMinutes,
  isOtpCooldown,
  otpCooldownSeconds,
  missingRegistrationField,
  hasShortName,
  hasShortCompanyName,
  normalizedEmail,
  duplicateKeyMessage,
  successMessage,
  newUserData,
};
