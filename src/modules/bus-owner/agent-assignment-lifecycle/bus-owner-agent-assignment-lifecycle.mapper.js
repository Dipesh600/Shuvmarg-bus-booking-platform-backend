'use strict';

const { toAssignmentTerms } = require('../../../shared/identity/agent-assignment-terms-mapper');
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
const toAssignment = (assignment) => {
  const stateContext = assignment.status === 'SUSPENDED'
    ? { suspendedAt: assignment.suspendedAt || null, operatorNote: assignment.operatorNote || null }
    : assignment.status === 'REVOKED'
      ? { revokedAt: assignment.revokedAt || null, operatorNote: assignment.operatorNote || null }
      : {};

  return {
    assignmentId: assignment._id,
    status: assignment.status,
    invitedAt: assignment.invitedAt || null,
    expiresAt: assignment.expiresAt || null,
    acceptedAt: assignment.acceptedAt || null,
    declinedAt: assignment.declinedAt || null,
    statusReason: assignment.statusReason || null,
    // Suspension context remains stored for audit, but is current-state data. An
    // ACTIVE row must not read as if its old suspension is still in force.
    ...stateContext,
    agent: toAgent(assignment.agentId),
    brand: {
      id: assignment.operatorId?._id || assignment.operatorId || null,
      name: assignment.operatorId?.brandName || null,
    },
    ...toAssignmentTerms(assignment),
  };
};

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
