'use strict';

const { scopeOf } = require('../../../shared/identity/agent-enums');

/**
 * The wire shape for a freshly created agent.
 *
 * `agentCode` is the whole point of the response: the owner needs to hand it
 * back to the agent, and it is the only durable handle on the identity. Field
 * name matches GET /api/agent/me — schema calls it `code`, the wire calls it
 * `agentCode`, because `code` alone is ambiguous in a body full of other codes.
 *
 * `tempPassword` is deliberately NOT here. It goes out by SMS to the agent's own
 * phone and nowhere else — putting it in an HTTP response would put it in the
 * owner's browser history, logs and network tab, for an account the owner is not
 * meant to be able to operate.
 */
const toCreatedResponse = ({ agent, userId, name, phone, brand, isUpgrade, smsSent }) => ({
  success: true,
  message: isUpgrade
    ? 'Agent role added to the existing account.'
    : 'Agent created. They will receive login details by SMS.',
  data: {
    agentCode: agent.code || null,
    legacyAgentId: agent.agentId || null,
    agentId: agent._id,
    userId,
    name,
    phone,
    scope: scopeOf(agent),
    outletType: agent.outletType || null,
    kycStatus: agent.applicationStatus,
    brand: brand ? { id: brand._id, name: brand.brandName || null } : null,
    isUpgrade,
    // False when no SMS was attempted (existing account) or delivery failed.
    // The owner can read the code off this response either way.
    smsSent,
    // Reminder for the client: the agent is not usable yet, and the owner is
    // not the one who makes them usable.
    requiresAgentActivation: !isUpgrade,
  },
});

module.exports = {
  toCreatedResponse,
};
