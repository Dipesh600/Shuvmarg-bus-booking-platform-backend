'use strict';

const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const sendSMS = require('../../../../handlers/sparro-otp.js');
const phoneGuard = require('../../../../utils/phoneGuard.js');
const errors = require('./bus-owner-agent-invite.errors');
const mapper = require('./bus-owner-agent-invite.mapper');
const policy = require('./bus-owner-agent-invite.policy');
const repository = require('./bus-owner-agent-invite.repository');

const TEMP_PASSWORD_BYTES = 5;
const BCRYPT_ROUNDS = 12;

const generateTempPassword = () => crypto
  .randomBytes(TEMP_PASSWORD_BYTES)
  .toString('hex')
  .toUpperCase();

/** Optional brand scoping. Absent brandId means no brand claim to verify. */
const resolveBrand = async (ownerId, brandId) => {
  if (!brandId) return null;
  const brand = await repository.findOwnedBrand(ownerId, brandId);
  if (!brand) throw errors.brandNotOwnedError();
  return brand;
};

/**
 * Reuse an existing User when the phone is already on the platform — a driver,
 * a conductor, a passenger. One human, one account, roles added to it. Creating
 * a second User for the same phone is what the unique index exists to stop.
 */
const resolveUser = async ({ name, phone, now }) => {
  const { exists, hasRole, user } = await phoneGuard.checkPhoneForRole(phone, 'agent');

  if (exists && hasRole) {
    // Belt and braces: the role can be present while the Agent profile is not,
    // if a previous create failed between the two writes. That case is
    // recoverable, so only refuse when the profile actually exists.
    const existingAgent = await repository.findAgentByUserId(user._id);
    if (existingAgent) throw errors.alreadyAgentError();
    return { userId: user._id, tempPassword: null, isUpgrade: true };
  }

  if (exists) {
    await repository.addAgentRole(user._id, now);
    return { userId: user._id, tempPassword: null, isUpgrade: true };
  }

  const tempPassword = generateTempPassword();
  const hashedPassword = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS);
  const created = await repository.createUser(
    policy.invitedAgentUser({ name, phone, hashedPassword, now }),
  );
  return { userId: created._id, tempPassword, isUpgrade: false };
};

/**
 * Delivery is best-effort. A failed SMS must not roll back an identity that is
 * already written and already has a code — the owner can resend. Existing
 * accounts get no SMS because they have no new password to learn.
 */
const notify = async ({ name, phone, tempPassword, brandName }) => {
  if (!tempPassword) return false;
  try {
    await sendSMS(phone, policy.smsBody({ name, phone, tempPassword, brandName }));
    return true;
  } catch (error) {
    console.error('[BusOwner createAgent] SMS delivery failed:', error.message);
    return false;
  }
};

const createAgent = async (ownerId, body) => {
  const { name, phone, outletType, errors: inputErrors } = policy.validateCreateInput(body);
  if (inputErrors.length > 0) throw errors.invalidInputError(inputErrors);

  const normalisedPhone = phoneGuard.normalizePhone(phone);
  if (!policy.isValidNepalMobile(normalisedPhone)) throw errors.invalidPhoneError();

  const brand = await resolveBrand(ownerId, body?.brandId);
  const now = new Date();

  try {
    const { userId, tempPassword, isUpgrade } = await resolveUser({
      name,
      phone: normalisedPhone,
      now,
    });

    const agent = await repository.createAgent(
      policy.newOperatorAgent({ userId, ownerId, outletType }),
    );

    const smsSent = await notify({
      name,
      phone: normalisedPhone,
      tempPassword,
      brandName: brand?.brandName,
    });

    return {
      statusCode: 201,
      responseBody: mapper.toCreatedResponse({
        agent,
        userId,
        name,
        phone: normalisedPhone,
        brand,
        isUpgrade,
        smsSent,
      }),
    };
  } catch (error) {
    if (error.code === 11000) throw errors.duplicateKeyError(error);
    throw error;
  }
};

module.exports = {
  createAgent,
  generateTempPassword,
};
