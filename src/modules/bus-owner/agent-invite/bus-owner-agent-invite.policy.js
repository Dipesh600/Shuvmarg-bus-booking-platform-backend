'use strict';

const { AGENT_SCOPES, KYC_STATUSES, isOutletType } = require('../../../shared/identity/agent-enums');

const NEPAL_MOBILE_RE = /^(97|98)\d{8}$/;
const MIN_NAME_LENGTH = 3;
const MAX_NAME_LENGTH = 200;

/**
 * What a bus owner may supply when creating an agent identity.
 *
 * Two required fields, name and phone, and nothing identity-bearing. No PAN, no
 * citizenship number, no bank details — those belong to the agent, and we never
 * need them because we never pay an OPERATOR-scope agent. The operator pays
 * them directly.
 *
 * The owner is inviting, not activating. Everything about the resulting account
 * is deliberately incomplete until the agent themselves signs in.
 */
const validateCreateInput = (body) => {
  const source = body && typeof body === 'object' ? body : {};
  const errors = [];

  const name = typeof source.name === 'string' ? source.name.trim() : '';
  const phone = typeof source.phone === 'string' ? source.phone.trim() : '';
  const outletType = typeof source.outletType === 'string' ? source.outletType.trim() : null;

  if (!name) errors.push('name is required.');
  else if (name.length < MIN_NAME_LENGTH) errors.push(`name must be at least ${MIN_NAME_LENGTH} characters.`);
  else if (name.length > MAX_NAME_LENGTH) errors.push(`name must be ${MAX_NAME_LENGTH} characters or fewer.`);

  if (!phone) errors.push('phone is required.');
  if (outletType && !isOutletType(outletType)) errors.push('outletType is not a recognised outlet type.');

  return { name, phone, outletType: outletType || null, errors };
};

/** Validates the normalised phone, so 977-prefixed input is accepted. */
const isValidNepalMobile = (normalisedPhone) => NEPAL_MOBILE_RE.test(String(normalisedPhone));

/**
 * The User an owner-created agent starts life as.
 *
 * `status: 'invited'` is the whole security story. login.policy rejects that
 * status with ACCOUNT_NOT_ACTIVATED, so the temp password in the SMS cannot be
 * used to reach anything until the agent activates. An owner can therefore
 * create the identity but never operate it — which matters, because the owner
 * chose the password.
 */
const invitedAgentUser = ({ name, phone, hashedPassword, now }) => ({
  name,
  phone,
  password: hashedPassword,
  role: 'agent',
  roles: ['agent'],
  status: 'invited',
  forcePasswordChange: true,
  phoneVerified: false,
  isVerified: false,
  roleActivatedAt: { agent: now },
});

/**
 * The Agent identity an owner creates.
 *
 * `scope: OPERATOR` and `applicationStatus: DRAFT` — the start of the short
 * OPERATOR machine. Not PHONE_VERIFIED: the owner typed the number, the agent
 * has not proved they hold it. That proof happens at activation.
 *
 * `createdByOwnerId` is provenance, not permission. It grants no selling right
 * — that needs an ACTIVE AgentAssignment, which does not exist until slice 2.
 */
const newOperatorAgent = ({ userId, ownerId, outletType }) => ({
  user: userId,
  scope: AGENT_SCOPES.OPERATOR,
  applicationStatus: KYC_STATUSES.DRAFT,
  createdByOwnerId: ownerId,
  outletType,
});

const smsBody = ({ name, phone, tempPassword, brandName }) => {
  const who = brandName ? ` by ${brandName}` : '';
  return `${name}, you've been added as a ticket agent on Shuvmarg${who}. `
    + `Login with Phone: ${phone} | Temp Password: ${tempPassword} — `
    + 'change your password on first login.';
};

module.exports = {
  MAX_NAME_LENGTH,
  MIN_NAME_LENGTH,
  invitedAgentUser,
  isValidNepalMobile,
  newOperatorAgent,
  smsBody,
  validateCreateInput,
};
