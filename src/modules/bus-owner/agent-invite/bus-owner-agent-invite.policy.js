'use strict';

const { AGENT_SCOPES, KYC_STATUSES, isOutletType } = require('../../../shared/identity/agent-enums');

const NEPAL_MOBILE_RE = /^(97|98)\d{8}$/;
const MIN_NAME_LENGTH = 3;
const MAX_NAME_LENGTH = 200;

/**
 * What a bus owner may supply when creating an agent identity.
 *
 * Name, phone and the four outlet/place fields are required, and nothing identity-bearing. No PAN, no
 * citizenship number, no bank details — those belong to the agent, and we never
 * need them because we never pay an OPERATOR-scope agent. The operator pays
 * them directly.
 *
 * The owner vouches for the light OPERATOR profile, but the invited User remains
 * unusable until the agent proves phone ownership through account activation.
 */
const validateCreateInput = (body) => {
  const source = body && typeof body === 'object' ? body : {};
  const errors = [];

  const name = typeof source.name === 'string' ? source.name.trim() : '';
  const phone = typeof source.phone === 'string' ? source.phone.trim() : '';
  const outletType = typeof source.outletType === 'string' ? source.outletType.trim() : '';
  const district = typeof source.district === 'string' ? source.district.trim() : '';
  const municipality = typeof source.municipality === 'string' ? source.municipality.trim() : '';
  const placeName = typeof source.placeName === 'string' ? source.placeName.trim() : '';

  if (!name) errors.push('name is required.');
  else if (name.length < MIN_NAME_LENGTH) errors.push(`name must be at least ${MIN_NAME_LENGTH} characters.`);
  else if (name.length > MAX_NAME_LENGTH) errors.push(`name must be ${MAX_NAME_LENGTH} characters or fewer.`);

  if (!phone) errors.push('phone is required.');
  if (!outletType) errors.push('outletType is required.');
  else if (!isOutletType(outletType)) errors.push('outletType is not a recognised outlet type.');
  if (!district) errors.push('district is required.');
  if (!municipality) errors.push('municipality is required.');
  if (!placeName) errors.push('placeName is required.');

  return { name, phone, outletType, district, municipality, placeName, errors };
};

/** Validates the normalised phone, so 977-prefixed input is accepted. */
const isValidNepalMobile = (normalisedPhone) => NEPAL_MOBILE_RE.test(String(normalisedPhone));

/**
 * The User an owner-created agent starts life as.
 *
 * `status: 'invited'` prevents login. The bootstrap secret is never disclosed;
 * activation requires phone OTP verification and a password chosen by the agent.
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
 * The owner vouches for the minimal OPERATOR identity, so it starts at
 * VERIFIED_BASIC. The User remains status=invited until phone activation;
 * verification status alone cannot authenticate or activate that account.
 *
 * `createdByOwnerId` is provenance, not permission. It grants no selling right
 * — that needs an ACTIVE AgentAssignment, which does not exist until slice 2.
 */
const newOperatorAgent = ({ userId, ownerId, outletType, district, municipality, placeName }) => ({
  user: userId,
  scope: AGENT_SCOPES.OPERATOR,
  applicationStatus: KYC_STATUSES.VERIFIED_BASIC,
  createdByOwnerId: ownerId,
  outletType,
  district,
  municipality,
  placeName,
});

const smsBody = ({ name, phone, brandName }) => {
  const who = brandName ? ` by ${brandName}` : '';
  return `${name}, you've been added as a ticket agent on Shuvmarg${who}. `
    + `Open the Partner app, choose Agent, tap "Set up invited account", enter ${phone}, `
    + 'verify the SMS code, and create your password.';
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
