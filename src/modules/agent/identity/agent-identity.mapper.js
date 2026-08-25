'use strict';

const { KYC_STATUSES, isKycSellable, outletTypeOf, scopeOf } = require('../../../shared/identity/agent-enums');

/**
 * Wire naming: the schema field is `Agent.code`, the wire field is `agentCode`.
 * `code` alone is ambiguous in a JSON body full of other codes (brandCode,
 * couponCode, errorCode); `agentCode` is what the master plan and every client
 * screen call it. The mapper is the one place that translation happens.
 */

const KYC_LABELS = new Map([
  [KYC_STATUSES.DRAFT, 'Finish your setup to get started.'],
  [KYC_STATUSES.PHONE_VERIFIED, 'Phone verified. Add your outlet details.'],
  [KYC_STATUSES.VERIFIED_BASIC, 'Verified. Share your code with a bus operator to start selling.'],
  [KYC_STATUSES.PENDING, 'Your application is under review.'],
  [KYC_STATUSES.MORE_INFO, 'We need more information from you.'],
  [KYC_STATUSES.APPROVED, 'Approved.'],
  [KYC_STATUSES.REJECTED, 'Your application was not approved.'],
  [KYC_STATUSES.SUSPENDED, 'Your agent account is suspended. Please contact support.'],
]);

const kycLabelFor = (status) => KYC_LABELS.get(status) || 'Status unavailable.';

const sharePayloadFor = (agent) => {
  const code = agent.code || agent.agentId;
  return code ? `My Shuvmarg agent code is ${code}` : null;
};

const toIdentity = (agent, user) => {
  const scope = scopeOf(agent);
  return {
    agentCode: agent.code || null,
    // Present only while the legacy SHV-AG scheme is still readable. Clients
    // display `agentCode`; this exists so an agent who wrote the old one down
    // can still be found. Goes away with the field.
    legacyAgentId: agent.agentId || null,
    scope,
    outletType: outletTypeOf(agent),
    kycStatus: agent.applicationStatus,
    kycStatusLabel: kycLabelFor(agent.applicationStatus),
    // Whether the agent's OWN verification clears them to sell. It is not
    // permission to sell — that needs an ACTIVE AgentAssignment (slice 2).
    kycCleared: isKycSellable(scope, agent.applicationStatus),
    name: user?.name || null,
    phone: user?.phone || null,
    photoUrl: user?.profilePicture || null,
    district: agent.district || null,
    municipality: agent.municipality || null,
    placeName: agent.placeName || null,
    businessName: agent.businessName || null,
    shopAddress: agent.shopAddress || null,
    // True when a bus owner created this identity rather than the agent
    // self-registering. Provenance only; grants nothing.
    createdByOperator: Boolean(agent.createdByOwnerId),
    /**
     * Always zero in slice 1: AgentAssignment does not exist yet. The key is
     * present so the wire shape does not change when slice 2 fills it in —
     * clients can render the summary now and it will simply start being
     * non-zero. Do NOT read this as "the agent has no assignments" until
     * slice 2 lands.
     */
    assignments: { total: 0, active: 0, invited: 0 },
    createdAt: agent.createdAt || null,
  };
};

const toIdentityResponse = (agent, user) => ({
  success: true,
  message: 'Agent identity retrieved.',
  data: toIdentity(agent, user),
});

const toUpdatedIdentityResponse = (agent, user) => ({
  success: true,
  message: 'Profile updated.',
  data: toIdentity(agent, user),
});

const toCodeResponse = (agent) => ({
  success: true,
  message: 'Agent code retrieved.',
  data: {
    agentCode: agent.code || null,
    legacyAgentId: agent.agentId || null,
    // The exact string to put on a clipboard or into a share sheet, composed
    // server-side so all three clients share one wording.
    sharePayload: sharePayloadFor(agent),
    scope: scopeOf(agent),
    kycStatus: agent.applicationStatus,
  },
});

module.exports = {
  KYC_LABELS,
  kycLabelFor,
  sharePayloadFor,
  toCodeResponse,
  toIdentity,
  toIdentityResponse,
  toUpdatedIdentityResponse,
};
