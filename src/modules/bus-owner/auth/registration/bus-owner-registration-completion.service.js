'use strict';
const registrationProof = require('../../../../shared/auth/registration-proof');

const phoneGuard = require('../../../../../utils/phoneGuard');
const tokenService = require('../../../../../utils/tokenService');
const verificationToken = require('../../../../../utils/verificationToken');
const repository = require('./bus-owner-registration.repository');
const leadRepository = require('./bus-owner-registration-lead.repository');
const policy = require('./bus-owner-registration.policy');
const errors = require('./bus-owner-registration.errors');
const { persistUpgrade } = require('./bus-owner-registration-upgrade');
const { requireRoleGrantResult } = require('../../../../shared/auth/role-grant-state');

const validateBasics = ({ phone, name, companyName, verificationToken: token }) => {
  const missing = policy.missingRegistrationField({ phone, name, companyName });
  if (missing) throw errors.missingRegistrationFieldError(missing);
  if (policy.hasShortName(name)) throw errors.shortNameError();
  if (policy.hasShortCompanyName(companyName)) throw errors.shortCompanyNameError();
  const tokenResult = verificationToken.validateVerificationToken(
    token,
    phone,
    policy.BUS_OWNER_PURPOSE,
  );
  if (!tokenResult.valid) throw errors.verificationTokenError(tokenResult.error);
};

const assertRecentOtp = async (phone) => {
  const otpRecord = await repository.findConsumedOtp(phone);
  if (!otpRecord) throw errors.phoneNotVerifiedError();
  if (!policy.isOtpRecent(otpRecord, Date.now())) throw errors.otpExpiredError();
};

const persistNewUser = async ({ phone, name, password, email, address, now }) => {
  const bcrypt = require('bcryptjs');
  const passwordValidator = require('../../../../../utils/passwordValidator');
  if (!password) throw errors.missingNewPasswordError();
  const check = passwordValidator.validatePassword(password);
  if (!check.valid) throw errors.invalidPasswordError(check);
  if (email) {
    const emailExists = await repository.findUserByEmail(policy.normalizedEmail(email));
    if (emailExists) throw errors.duplicateEmailError();
  }
  const hashedPassword = await bcrypt.hash(password, 12);
  return repository.createUser(policy.newUserData({
    phone,
    name,
    password: hashedPassword,
    email,
    address,
    now,
  }));
};

const ensureBusOwnerProfile = async ({ userId, companyName }) => {
  const existing = await repository.findBusOwnerByUser(userId);
  if (!existing) await repository.createBusOwnerProfile({ userId, companyName });
};

const buildResponse = ({ savedUser, accessToken, isUpgrade }) => {
  const userObj = savedUser.toObject ? savedUser.toObject() : { ...savedUser };
  delete userObj.password;
  return {
    success: true,
    message: policy.successMessage(isUpgrade),
    user: userObj,
    accessToken,
    activeRole: 'busOwner',
    isUpgrade,
  };
};

const convertLead = ({ savedUser, phone }) => {
  const normalizedPhone = phoneGuard.normalizePhone(savedUser.phone || phone);
  if (!normalizedPhone) return;
  leadRepository.convertOtpVerifiedLead(normalizedPhone)
    .catch((err) => console.error('[PartnerLead convert - register] Non-fatal:', err.message));
};

const register = async (input) => {
  validateBasics(input);
  await assertRecentOtp(input.phone);
  const { exists, hasRole, user } = await phoneGuard.checkPhoneForRole(input.phone, 'busOwner', { includeDeleted: true });
  if (exists && hasRole) throw errors.roleAlreadyRegisteredError();
  const isUpgrade = Boolean(exists && user);
  await registrationProof.consume(input.verificationToken, input.phone, policy.BUS_OWNER_PURPOSE);
  const now = new Date();
  const savedUser = isUpgrade
    ? await persistUpgrade(user, input.password, now)
    : await persistNewUser({ ...input, now });
  requireRoleGrantResult(savedUser);
  await ensureBusOwnerProfile({ userId: savedUser._id, companyName: input.companyName });
  const { accessToken, refreshToken } = await tokenService.generateTokenPair(savedUser, {
    deviceInfo: input.deviceInfo,
    ipAddress: input.ipAddress,
    activeRole: 'busOwner',
  });
  const responseBody = buildResponse({ savedUser, accessToken, isUpgrade });
  convertLead({ savedUser, phone: input.phone });
  return { statusCode: 201, refreshToken, responseBody };
};

module.exports = {
  register,
  validateBasics,
  assertRecentOtp,
  buildResponse,
};
