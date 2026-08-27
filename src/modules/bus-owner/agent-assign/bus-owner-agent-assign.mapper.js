'use strict';

const { displayAgentCode } = require('../../../shared/identity/agent-code-lookup');
const { outletTypeOf } = require('../../../shared/identity/agent-enums');

/**
 * Permissions and commission are read back off the saved document, not echoed
 * from the request. The request may have omitted both, in which case the schema
 * defaults are what is now stored — and an operator who is told "canSellOnline:
 * true" because that is what they did not send would be told the opposite of the
 * truth.
 *
 * Every field is named explicitly rather than spread. The subdocuments are
 * operator-facing terms, and a spread would publish whatever the schema grows
 * next without anyone deciding to.
 */
const toTerms = (assignment) => ({
  access: {
    accessScope: assignment.accessScope,
    allowedRouteIds: (assignment.allowedRouteIds || []).map(String),
    allowedScheduleIds: (assignment.allowedScheduleIds || []).map(String),
  },
  permissions: {
    canSellCash: assignment.permissions?.canSellCash,
    canSellOnline: assignment.permissions?.canSellOnline,
    canCancel: assignment.permissions?.canCancel,
    cancelWindowMins: assignment.permissions?.cancelWindowMins,
    maxSeatsPerBooking: assignment.permissions?.maxSeatsPerBooking ?? null,
    maxDiscountPct: assignment.permissions?.maxDiscountPct,
  },
  commission: {
    mode: assignment.operatorCommission?.mode,
    value: assignment.operatorCommission?.value,
  },
});

/**
 * The wire shape for a freshly created assignment.
 *
 * The agent block is the same subset the lookup preview returns — code, name,
 * outlet, verification — and no more. An operator who has just invited someone
 * has not thereby earned their phone number; the point at which contact details
 * become reasonable is acceptance, and that is a different endpoint's decision.
 *
 * `status` is INVITED and `requiresAgentAcceptance` says so in words, so a client
 * cannot read a 201 as "this agent can now sell". Nothing about this response
 * grants a selling right: the guard reads the assignment status at sale time,
 * which is the only place that can be true.
 */
const toCreatedResponse = ({ assignment, agent, brand, kycStatus, isVerified }) => ({
  success: true,
  message: 'Invitation sent. The agent must accept it before they can sell.',
  data: {
    assignmentId: assignment._id,
    status: assignment.status,
    invitedAt: assignment.invitedAt,
    expiresAt: assignment.expiresAt,
    agent: {
      agentCode: displayAgentCode(agent),
      name: agent?.user?.name || null,
      outletType: outletTypeOf(agent),
      businessName: agent.businessName || null,
      kycStatus,
      isVerified,
    },
    brand: { id: brand._id, name: brand.brandName || null },
    ...toTerms(assignment),
    requiresAgentAcceptance: true,
  },
});

module.exports = {
  toCreatedResponse,
};
