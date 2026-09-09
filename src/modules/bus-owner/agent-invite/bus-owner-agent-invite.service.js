'use strict';

const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const phoneGuard = require('../../../../utils/phoneGuard.js');
const notificationOutbox = require('../../notifications/outbox');
const errors = require('./bus-owner-agent-invite.errors');
const mapper = require('./bus-owner-agent-invite.mapper');
const policy = require('./bus-owner-agent-invite.policy');
const repository = require('./bus-owner-agent-invite.repository');

const { requireRoleGrantResult } = require('../../../shared/auth/role-grant-state');

const BCRYPT_ROUNDS = 12;

const generateBootstrapSecret = () => crypto.randomBytes(32).toString('base64url');

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
const resolveUser = async ({ name, phone, now, session }) => {
  const { exists, hasRole, user } = await phoneGuard.checkPhoneForRole(phone, 'agent');

  if (exists && hasRole) {
    // Belt and braces: the role can be present while the Agent profile is not,
    // if a previous create failed between the two writes. That case is
    // recoverable, so only refuse when the profile actually exists.
    const existingAgent = await repository.findAgentByUserId(user._id, session);
    if (existingAgent) throw errors.alreadyAgentError();
    requireRoleGrantResult(await repository.addAgentRole(user._id, now, session));
    return { userId: user._id, activationRequired: false, isUpgrade: true };
  }

  if (exists) {
    requireRoleGrantResult(await repository.addAgentRole(user._id, now, session));
    return { userId: user._id, activationRequired: false, isUpgrade: true };
  }

  // The hash satisfies the operational-account schema but the secret is never
  // disclosed or accepted as an onboarding credential. The agent activates by
  // proving phone ownership and choosing a fresh password.
  const hashedPassword = await bcrypt.hash(generateBootstrapSecret(), BCRYPT_ROUNDS);
  const created = await repository.createUser(
    policy.invitedAgentUser({ name, phone, hashedPassword, now }), session,
  );
  return { userId: created._id, activationRequired: true, isUpgrade: false };
};

/**
 * Delivery is best-effort. A failed SMS must not roll back an identity that is
 * already written and already has a code — the owner can resend. Existing
 * accounts get no SMS because they have no new password to learn.
 */
const notify = async ({ jobId }) => {
  if (!jobId) return 'NOT_REQUIRED';
  try {
    const result = await notificationOutbox.deliverSmsNotification(jobId);
    if (['PROVIDER_ACCEPTED', 'DELIVERED'].includes(result?.status)) return 'QUEUED';
    return ['FAILED', 'EXPIRED', 'CANCELLED'].includes(result?.status) ? 'FAILED' : 'PENDING';
  } catch (error) {
    console.error('[BusOwner createAgent] SMS queue request failed:', error.message);
    return 'FAILED';
  }
};

const createAgent = async (ownerId, body) => {
  const input = policy.validateCreateInput(body);
  const { name, phone, errors: inputErrors } = input;
  if (inputErrors.length > 0) throw errors.invalidInputError(inputErrors);

  const normalisedPhone = phoneGuard.normalizePhone(phone);
  if (!policy.isValidNepalMobile(normalisedPhone)) throw errors.invalidPhoneError();

  const brand = await resolveBrand(ownerId, body?.brandId);
  const now = new Date();

  try {
    const { agent, jobId, isUpgrade } = await repository.withTransaction(async session => {
      const { userId, activationRequired, isUpgrade } = await resolveUser({
        name,
        phone: normalisedPhone,
        now, session,
      });

      const agent = await repository.createAgent(
        policy.newOperatorAgent({
          userId,
          ownerId,
          outletType: input.outletType,
          district: input.district,
          municipality: input.municipality,
          placeName: input.placeName,
        }), session,
      );
      let jobId = null;
      if (activationRequired) {
        const job = await notificationOutbox.enqueueSms({
          messageType: 'AGENT_INVITATION',
          idempotencyKey: `agent:${agent._id}:activation:1`,
          businessReference: `agent:${agent._id}`,
          recipientPhone: normalisedPhone,
          body: policy.smsBody({ name, phone: normalisedPhone, brandName: brand?.brandName }),
          userId,
          ownerId,
          brandId: brand?._id || null,
          expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        }, { session });
        jobId = job._id;
      }
      return { agent, jobId, isUpgrade };
    });

    const smsStatus = await notify({ jobId });

    return {
      statusCode: 200,
      responseBody: mapper.toCreatedResponse({
        agent,
        name,
        phone: normalisedPhone,
        brand,
        isUpgrade,
        smsStatus,
      }),
    };
  } catch (error) {
    if (error.name === 'ValidationError') {
      throw errors.invalidInputError(Object.values(error.errors || {}).map((item) => item.message));
    }
    if (error.code === 11000) throw errors.duplicateKeyError(error);
    throw error;
  }
};

module.exports = {
  createAgent,
  generateBootstrapSecret,
};
