'use strict';

const { toTerms } = require('../agent-assign/bus-owner-agent-assign.mapper');
const { displayAgentCode } = require('../../../shared/identity/agent-code-lookup');
const { outletTypeOf } = require('../../../shared/identity/agent-enums');
const {
  effectiveKycStatus,
  hasVerifiedBadge,
} = require('../../../shared/identity/agent-assignability');

const toAgent = (agent) => {
  const kycStatus = effectiveKycStatus(agent);
  return {
    agentCode: displayAgentCode(agent),
    name: agent?.user?.name || null,
    outletType: outletTypeOf(agent),
    businessName: agent?.businessName || null,
    district: agent?.district || null,
    municipality: agent?.municipality || null,
    kycStatus,
    isVerified: hasVerifiedBadge(agent, kycStatus),
  };
};

/** Explicit operator view: no agent contact, identity documents or other owners. */
const toAssignment = (assignment) => ({
  assignmentId: assignment._id,
  status: assignment.status,
  invitedAt: assignment.invitedAt || null,
  expiresAt: assignment.expiresAt || null,
  acceptedAt: assignment.acceptedAt || null,
  declinedAt: assignment.declinedAt || null,
  suspendedAt: assignment.suspendedAt || null,
  revokedAt: assignment.revokedAt || null,
  statusReason: assignment.statusReason || null,
  operatorNote: assignment.operatorNote || null,
  agent: toAgent(assignment.agentId),
  brand: {
    id: assignment.operatorId?._id || assignment.operatorId || null,
    name: assignment.operatorId?.brandName || null,
  },
  ...toTerms(assignment),
});

const toListResponse = ({ rows, total, page, limit }) => ({
  success: true,
  data: rows.map(toAssignment),
  pagination: {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  },
});

const PAST_TENSE = Object.freeze({
  suspend: 'suspended',
  reinstate: 'reinstated',
  revoke: 'revoked',
});

const toTransitionResponse = (assignment, action) => ({
  success: true,
  message: `Assignment ${PAST_TENSE[action]} successfully.`,
  data: toAssignment(assignment),
});

module.exports = {
  toAssignment,
  toListResponse,
  toTransitionResponse,
};
