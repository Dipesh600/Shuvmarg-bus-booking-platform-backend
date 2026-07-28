'use strict';

const repository = require('./agent-application-status.repository');
const documentUrls = require('./document-url.service');
const reapplyPolicy = require('./reapply-policy');
const mapper = require('./agent-application-status.mapper');

const getApplicationStatus = async ({ userId, userName }) => {
  if (!userId) {
    return {
      statusCode: 401,
      body: { success: false, message: 'Unauthorized.' },
    };
  }

  const agent = await repository.findApplicationByUser(userId);
  if (!agent) {
    return {
      statusCode: 200,
      body: mapper.noApplication(userName),
    };
  }

  const documents = await documentUrls.resolveDocumentUrls(agent.documents || []);
  const reapply = reapplyPolicy.calculateReapply(agent, Date.now());

  return {
    statusCode: 200,
    body: mapper.applicationStatus(agent, documents, reapply),
  };
};

module.exports = {
  getApplicationStatus,
};
