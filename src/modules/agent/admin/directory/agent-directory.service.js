'use strict';

const repository = require('./agent-directory.repository');
const mapper = require('./agent-directory.mapper');
const documentPreview = require('./agent-document-preview.service');

const getAgentsById = async ({ id }) => {
  if (!id) {
    return {
      statusCode: 400,
      body: { success: false, message: 'Id is required!' },
    };
  }

  const { agent, user } = await repository.findAgentDetailsById(id);
  if (!agent) {
    return {
      statusCode: 404,
      body: { success: false, message: 'Agent not found!' },
    };
  }

  const documents = await documentPreview.resolveDocumentUrls(agent.documents);
  return {
    statusCode: 200,
    body: mapper.detailsResponse(agent, user, documents),
  };
};

const buildFilter = ({ status, type }) => {
  const filter = {};
  if (status) filter.applicationStatus = status;
  if (type) filter.agentType = type;
  return filter;
};

const getAllAgents = async ({ status, type }) => {
  const agents = await repository.listAgents(buildFilter({ status, type }));
  return {
    statusCode: 200,
    body: mapper.listResponse(agents),
  };
};

module.exports = {
  getAgentsById,
  getAllAgents,
};
