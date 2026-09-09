'use strict';

const notificationManager = require('../../../../../controllers/notificationController/notification_manager');
const notificationOutbox = require('../../../notifications/outbox');

const welcomeSms = (agentUser, agent) => (
  `Welcome to Shuvmarg, ${agentUser.name || 'Agent'}! ` +
  `Your agent account (${agent.agentId}) is approved. ` +
  'Start selling tickets now at www.shuvmargagent.vercel.app/'
);

const sendSmsIfPossible = async (agentUser, agent, deps = {}) => {
  if (!agentUser?.phone) return;
  try {
    await (deps.dispatchSms || notificationOutbox.dispatchSms)({
      messageType: 'AGENT_SETUP_APPROVED',
      idempotencyKey: `agent:${agent._id || agent.agentId}:setup-approved:${agent.__v || 1}`,
      businessReference: `agent:${agent._id || agent.agentId}`,
      recipientPhone: agentUser.phone,
      body: welcomeSms(agentUser, agent),
      userId: agentUser._id || agent.user,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
  } catch (smsErr) {
    console.warn('[finalizeAgentSetup] SMS failed (non-fatal):', smsErr.message);
  }
};

const createLocalWelcome = async (agent) => {
  try {
    await notificationManager.createLocalNotification(
      agent.user,
      'AGENT_KYC_UPDATE',
      'Welcome to Shuvmarg!',
      'Your agent account is ready. Download the Shuvmarg Partner App to get started.',
      { applicationStatus: 'APPROVED', agentId: agent.agentId }
    );
  } catch (notifyErr) {
    console.warn('[finalizeAgentSetup] Push failed (non-fatal):', notifyErr.message);
  }
};

const notifyOperatorLinkedAgent = async (agentUser, agent, deps = {}) => {
  await sendSmsIfPossible(agentUser, agent, deps);
  await createLocalWelcome(agent);
};

module.exports = {
  notifyOperatorLinkedAgent,
  welcomeSms,
};
