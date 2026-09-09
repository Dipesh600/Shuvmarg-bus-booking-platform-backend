'use strict';

const emailManager = require('../../../../emailManager/emailManager');
const notification = require('../../../../controllers/notificationController/notification_manager');
const notificationOutbox = require('../../notifications/outbox');
const generateAgentStatusEmail = require('../../../../handlers/agentStatusEmailTemp');
const repository = require('./agent-kyc-review.repository');
const policy = require('./agent-kyc-review.policy');

const applyDocumentReviews = (agent, documentVerifications, adminId) => {
  if (!documentVerifications || !Array.isArray(documentVerifications)) return;
  for (const review of documentVerifications) {
    const doc = agent.documents.find((item) => item.type === review.type);
    if (!doc) continue;
    if (typeof review.verified === 'boolean') {
      doc.verified = review.verified;
      if (review.verified) {
        doc.verifiedBy = adminId || null;
        doc.verifiedAt = new Date();
        doc.rejectionReason = null;
      }
    }
    if (typeof review.rejectionReason === 'string') doc.rejectionReason = review.rejectionReason;
  }
};

const syncStatus = async (agent, body, adminId) => {
  const prevStatus = agent.applicationStatus;
  agent.applicationStatus = body.applicationStatus;
  if (body.applicationStatus === 'APPROVED') {
    agent.approvedAt = new Date();
    agent.approvedBy = adminId || null;
    agent.rejectionReason = null;
    agent.moreInfoRequest = null;
    await repository.updateUser(agent.user, { isVerified: true, status: 'active' });
  }
  if (body.applicationStatus === 'REJECTED') {
    agent.rejectionReason = body.rejectionReason || 'Application rejected.';
    if (typeof body.isPermanentlyRejected === 'boolean') {
      agent.isPermanentlyRejected = body.isPermanentlyRejected;
    }
    await repository.updateUser(agent.user, { isVerified: false });
  }
  await syncMoreInfoOrSuspension(agent, body, adminId, prevStatus);
};

const syncMoreInfoOrSuspension = async (agent, body, adminId, prevStatus) => {
  if (body.applicationStatus === 'MORE_INFO') {
    agent.moreInfoRequest = body.moreInfoRequest || 'Additional information required.';
    agent.moreInfoRequestedAt = new Date();
  }
  if (body.applicationStatus === 'SUSPENDED') {
    agent.suspendedAt = new Date();
    agent.suspendedBy = adminId || null;
    agent.suspensionReason = body.rejectionReason || 'Account suspended.';
    await repository.updateUser(agent.user, { status: 'inactive' });
  }
  if (body.applicationStatus === 'APPROVED' && prevStatus === 'SUSPENDED') {
    agent.suspendedAt = null;
    agent.suspendedBy = null;
    agent.suspensionReason = null;
    await repository.updateUser(agent.user, { status: 'active', isVerified: true });
  }
};

const applyAdminConfig = (agent, body) => {
  if (typeof body.commissionRate === 'number') agent.commissionRate = body.commissionRate;
  if (typeof body.minSettlementThreshold === 'number') {
    agent.minSettlementThreshold = body.minSettlementThreshold;
  }
  if (typeof body.adminNotes === 'string') agent.adminNotes = body.adminNotes;
};

const notifyAgent = async (agent, applicationStatus) => {
  if (!applicationStatus) return;
  const user = await repository.findNotificationUser(agent.user);
  const statusText = agent.applicationStatus || 'DRAFT';
  const invalidDocs = policy.invalidDocuments(agent.documents);
  await sendEmail(user, statusText, invalidDocs);
  await sendSms(user, agent, applicationStatus, invalidDocs);
  await sendPush(agent, applicationStatus, statusText);
};

const sendEmail = async (user, statusText, invalidDocs) => {
  if (!user || !user.email) return;
  try {
    const emailHtml = generateAgentStatusEmail(user.name, statusText, invalidDocs);
    await emailManager(user.email, 'Agent Application Update', emailHtml);
  } catch (emailErr) {
    console.warn('[updateAgentKyc] Email failed (non-fatal):', emailErr.message);
  }
};

const sendSms = async (user, agent, applicationStatus, invalidDocs) => {
  if (!user || !user.phone) return;
  try {
    await notificationOutbox.dispatchSms({
      messageType: 'AGENT_KYC',
      idempotencyKey: `agent:${agent._id}:kyc:${applicationStatus}:${agent.__v || 0}`,
      businessReference: `agent:${agent._id}`,
      recipientPhone: user.phone,
      body: policy.smsText(user, agent, applicationStatus, invalidDocs),
      userId: user._id || agent.user,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
  } catch (smsErr) {
    console.warn('[updateAgentKyc] SMS failed (non-fatal):', smsErr.message);
  }
};

const sendPush = async (agent, applicationStatus, statusText) => {
  try {
    const title = 'Agent Application Update';
    const body = policy.pushBody(applicationStatus, statusText);
    if (!agent.user) return;
    await notification.createLocalNotification(agent.user, 'AGENT_KYC_UPDATE', title, body, {
      applicationStatus: statusText,
    });
    const devices = await repository.findUserDevices(agent.user);
    const tokens = devices.map((device) => device.token).filter(Boolean);
    if (tokens.length > 0) await notification.notificationManager(tokens, title, body);
  } catch (notifyError) {
    console.error('Agent notification error:', notifyError);
  }
};

const reviewAgentKyc = async (body, adminId) => {
  const agent = await repository.findAgentForReview(body.id);
  if (!agent) return { statusCode: 404, body: { success: false, message: 'Agent not found!' } };
  applyDocumentReviews(agent, body.documentVerifications, adminId);
  if (body.applicationStatus) await syncStatus(agent, body, adminId);
  applyAdminConfig(agent, body);
  await repository.saveAgent(agent);
  await notifyAgent(agent, body.applicationStatus);
  return {
    statusCode: 200,
    body: { success: true, message: 'Agent application updated successfully!' },
  };
};

module.exports = {
  reviewAgentKyc,
  applyDocumentReviews,
  syncStatus,
  applyAdminConfig,
  notifyAgent,
};
