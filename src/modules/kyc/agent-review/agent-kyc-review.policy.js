'use strict';

const invalidDocuments = (documents) => documents
  .filter((doc) => doc.verified === false || doc.rejectionReason)
  .map((doc) => ({
    label: doc.type.replace(/_/g, ' '),
    reason: doc.rejectionReason || null,
  }));

const approvalSms = (user, agent) => {
  if (agent.agentType === 'OPERATOR_LINKED') {
    return `Welcome ${user.name || 'Agent'}, your agent application is approved. Download the app and start selling tickets now! (Access via www.shuvmargagent.vercel.app/ for now)`;
  }
  return `Dear ${user.name || 'Agent'}, your agent application status is approved. You can start booking tickets now at www.shuvmargagent.vercel.app/`;
};

const smsText = (user, agent, applicationStatus, invalidDocs) => {
  let text = `Dear ${user.name || 'Agent'}, your agent application status is ${agent.applicationStatus || 'DRAFT'}.`;
  if (applicationStatus === 'APPROVED') text = approvalSms(user, agent);
  if (invalidDocs.length > 0) {
    text += ` Documents needing attention: ${invalidDocs.map((doc) => doc.label).join(', ')}.`;
  }
  return text;
};

const pushBody = (applicationStatus, statusText) => {
  if (applicationStatus === 'APPROVED') {
    return 'Congratulations! Your agent application has been approved.';
  }
  if (applicationStatus === 'REJECTED') {
    return 'Your agent application has been reviewed. Please check the app for details.';
  }
  if (applicationStatus === 'MORE_INFO') {
    return 'We need additional information for your application. Please check the app.';
  }
  return `Application status: ${statusText}.`;
};

module.exports = {
  invalidDocuments,
  smsText,
  pushBody,
};
