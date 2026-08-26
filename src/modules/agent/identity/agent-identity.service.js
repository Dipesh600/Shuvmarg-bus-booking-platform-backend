'use strict';

const AppError = require('../../../shared/errors/app-error');
const { deriveOperatorKycStatus } = require('../../../shared/identity/agent-verification');
const mapper = require('./agent-identity.mapper');
const policy = require('./agent-identity.policy');
const repository = require('./agent-identity.repository');

const noAgentError = () => new AppError('No agent profile found for this account.', 404, {
  success: false,
  message: 'No agent profile found for this account.',
  errorCode: 'NO_AGENT_PROFILE',
});

const invalidPatchError = (errors) => new AppError(errors[0], 400, {
  success: false,
  message: errors[0],
  errors,
});

/**
 * Fill in a missing `code` on an agent that predates the SM-AG scheme.
 *
 * Agent profiles are created with findOneAndUpdate({upsert:true}), and Mongoose
 * does not run pre('save') for upserts — so rows created that way carry neither
 * identifier until something saves them. Calling save() with both fields blank
 * lets the hook allocate; the hook only ever fills a blank, so an agent who
 * already has a published code keeps it.
 */
const backfillIdentifiers = async (agent) => {
  if (agent.code && agent.agentId) return agent;
  await repository.saveAgent(agent);
  return agent;
};

/**
 * Bring the OPERATOR KYC status up to date with the facts on file.
 *
 * Mutates the document and reports whether anything changed; the caller decides
 * when to write, so a status advance can ride along with a save that was already
 * happening.
 *
 * WHY THIS IS DERIVED ON READ RATHER THAN WRITTEN WHEN THE PHONE IS VERIFIED.
 * There is no single place to hook. Two flows verify an invited agent's phone —
 * POST /api/auth/activate and the forced-password-change repository — and both
 * are shared with conductors, drivers and bus owners, so both would need an
 * agent-shaped branch, and a third flow added later would need a third. One
 * forgotten call leaves an agent stuck at DRAFT with no way to notice. Deriving
 * from `user.phoneVerified` works no matter how the phone came to be verified,
 * including for the agents who already verified theirs before this shipped.
 *
 * This is the pattern backfillIdentifiers above already uses: a read that repairs
 * what it finds, idempotently.
 *
 * The accepted cost is that the write happens when the agent is next looked up.
 * Anything that reads an agent's status without going through here — the operator
 * code lookup in slice 2 — must call deriveOperatorKycStatus itself rather than
 * trusting the stored value.
 */
const applyDerivedKycStatus = (agent, user) => {
  const derived = deriveOperatorKycStatus(agent, { phoneVerified: user?.phoneVerified });
  if (!derived || derived === agent.applicationStatus) return false;
  agent.set('applicationStatus', derived);
  return true;
};

const loadIdentity = async (userId) => {
  const agent = await repository.findAgentByUserId(userId);
  if (!agent) throw noAgentError();
  await backfillIdentifiers(agent);
  const user = await repository.findUserById(userId);
  if (applyDerivedKycStatus(agent, user)) await repository.saveAgent(agent);
  return { agent, user };
};

const getIdentity = async (userId) => {
  const { agent, user } = await loadIdentity(userId);
  return { statusCode: 200, responseBody: mapper.toIdentityResponse(agent, user) };
};

const getCode = async (userId) => {
  const { agent } = await loadIdentity(userId);
  return { statusCode: 200, responseBody: mapper.toCodeResponse(agent) };
};

const updateIdentity = async (userId, body) => {
  const { agentPatch, userPatch, errors, isEmpty } = policy.buildProfilePatch(body);
  if (errors.length > 0) throw invalidPatchError(errors);

  const { agent, user } = await loadIdentity(userId);
  if (isEmpty) {
    return { statusCode: 200, responseBody: mapper.toUpdatedIdentityResponse(agent, user) };
  }

  for (const [field, value] of Object.entries(agentPatch)) {
    agent.set(field, value);
  }

  const updatedUser = userPatch.name
    ? await repository.updateUserName(userId, userPatch.name)
    : user;

  // Derived after the patch is on the document and before it is written, so an
  // agent who has just supplied their outlet details reaches VERIFIED_BASIC in
  // this response rather than on their next read. loadIdentity above ran before
  // the patch existed, so it could not have seen them.
  const advanced = applyDerivedKycStatus(agent, updatedUser);
  if (advanced || Object.keys(agentPatch).length > 0) await repository.saveAgent(agent);

  return {
    statusCode: 200,
    responseBody: mapper.toUpdatedIdentityResponse(agent, updatedUser),
  };
};

module.exports = {
  backfillIdentifiers,
  getCode,
  getIdentity,
  loadIdentity,
  updateIdentity,
};
