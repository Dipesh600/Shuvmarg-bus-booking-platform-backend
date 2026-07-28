'use strict';

const sendOTP = require('../../../../../handlers/sparro-otp');
const notificationManager = require('../../../../../controllers/notificationController/notification_manager');

const welcomeSms = (agentUser, agent) => (
  `Welcome to Shuvmarg, ${agentUser.name || 'Agent'}! ` +
  `Your agent account (${agent.agentId}) is approved. ` +
  'Start selling tickets now at www.shuvmargagent.vercel.app/'
);

const sendSmsIfPossible = async (agentUser, agent) => {
  if (!agentUser?.phone) return;
  try {
    await sendOTP(agentUser.phone, welcomeSms(agentUser, agent));
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

const notifyOperatorLinkedAgent = async (agentUser, agent) => {
  await sendSmsIfPossible(agentUser, agent);
  await createLocalWelcome(agent);
};

module.exports = {
  notifyOperatorLinkedAgent,
  welcomeSms,
};
