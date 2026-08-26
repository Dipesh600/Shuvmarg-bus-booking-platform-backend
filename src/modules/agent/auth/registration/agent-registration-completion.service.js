'use strict';

const bcrypt = require('bcryptjs');
const phoneGuard = require('../../../../../utils/phoneGuard');
const passwordValidator = require('../../../../../utils/passwordValidator');
const tokenService = require('../../../../../utils/tokenService');
const verificationToken = require('../../../../../utils/verificationToken');
const repository = require('./agent-registration.repository');
const leadRepository = require('./agent-registration-lead.repository');
const policy = require('./agent-registration.policy');
const errors = require('./agent-registration.errors');

const validateBasics = ({ phone, name, verificationToken: token }) => {
  if (!phone) throw errors.missingPhoneError('Phone is required.');
  if (!name) throw errors.missingNameError();
  if (name.trim().length < 3) throw errors.shortNameError();
  const tokenResult = verificationToken.validateVerificationToken(token, phone, policy.AGENT_PURPOSE);
  if (!tokenResult.valid) throw errors.verificationTokenError(tokenResult.error);
};

const assertRecentOtp = async (phone) => {
  const otpRecord = await repository.findConsumedOtp(phone);
  if (!otpRecord) throw errors.phoneNotVerifiedError();
  if (!policy.isOtpRecent(otpRecord, Date.now())) throw errors.otpExpiredError();
};

const validatePassword = (password, isUpgrade) => {
  if (!password) {
    throw isUpgrade ? errors.missingUpgradePasswordError() : errors.missingNewPasswordError();
  }
  const passwordCheck = passwordValidator.validatePassword(password);
  if (!passwordCheck.valid) throw errors.invalidPasswordError(passwordCheck);
};

const persistUpgrade = async ({ user, password, now }) => {
  validatePassword(password, true);
  const hashedPassword = await bcrypt.hash(password, 12);
  return repository.upgradeUserToAgent(user._id, hashedPassword, now);
};

const persistNewUser = async ({ phone, name, password, email, now }) => {
  validatePassword(password, false);
  if (email) {
    const emailExists = await repository.findUserByEmail(policy.normalizedEmail(email));
    if (emailExists) throw errors.duplicateEmailError();
  }
  const hashedPassword = await bcrypt.hash(password, 12);
  return repository.createUser(policy.newUserData({
    name,
    phone,
    password: hashedPassword,
    email,
    now,
  }));
};

/**
 * The profile is created by upsert, and Mongoose does not run pre('save') for
 * upserts — so a freshly upserted Agent has neither identifier. save() lets the
 * hook allocate both.
 *
 * Both fields are checked, not just agentId: an agent registered before the
 * SM-AG scheme landed has an agentId and no code, and testing agentId alone
 * would leave them permanently without the code they are meant to share. The
 * hook only ever fills a blank, so a published code is never re-minted.
 */
const ensureAgentProfile = async (userId) => {
  const agentDoc = await repository.upsertAgentProfile(userId);
  if (!agentDoc.agentId || !agentDoc.code) await agentDoc.save();
};

const issueTokens = async ({ savedUser, deviceInfo, ipAddress }) => tokenService.generateTokenPair(
  savedUser,
  {
    deviceInfo,
    ipAddress,
    activeRole: 'agent',
  },
);

const buildResponse = ({ savedUser, accessToken, isUpgradePath }) => {
  const userObj = savedUser.toObject ? savedUser.toObject() : { ...savedUser };
  delete userObj.password;
  return {
    success: true,
    message: isUpgradePath
      ? 'Agent access added to your account. Your new password has been set.'
      : 'Account created successfully. Complete your setup to start using Shuv Marg.',
    user: userObj,
    accessToken,
    activeRole: 'agent',
    isUpgrade: isUpgradePath,
    applicationStatus: 'DRAFT',
  };
};

const convertLead = async ({ savedUser, phone, name }) => {
  const normalizedPhone = phoneGuard.normalizePhone(savedUser.phone || phone);
  if (!normalizedPhone) return;
  try {
    await leadRepository.convertOtpVerifiedLead(normalizedPhone, name.trim());
  } catch (err) {
    console.error('[PartnerLead convert - agent register] Non-fatal:', err.message);
  }
};

const register = async ({ phone, name, password, email, verificationToken, deviceInfo, ipAddress }) => {
  validateBasics({ phone, name, verificationToken });
  await assertRecentOtp(phone);
  const { exists, hasRole, user: existingUser } = await phoneGuard.checkPhoneForRole(phone, 'agent');
  if (exists && hasRole) {
    const agentDoc = await repository.findAgentIdByUser(existingUser._id);
    if (agentDoc) throw errors.existingAgentError();
    console.warn(`[Agent register] Repairing orphaned agent role for user ${existingUser._id}`);
  }
  const isUpgradePath = Boolean(exists && existingUser);
  const now = new Date();
  const savedUser = isUpgradePath
    ? await persistUpgrade({ user: existingUser, password, now })
    : await persistNewUser({ phone, name, password, email, now });
  await ensureAgentProfile(savedUser._id);
  const { accessToken, refreshToken } = await issueTokens({ savedUser, deviceInfo, ipAddress });
  await convertLead({ savedUser, phone, name });
  return {
    statusCode: 201,
    refreshToken,
    responseBody: buildResponse({ savedUser, accessToken, isUpgradePath }),
  };
};

module.exports = {
  register,
  validateBasics,
  assertRecentOtp,
  buildResponse,
};
