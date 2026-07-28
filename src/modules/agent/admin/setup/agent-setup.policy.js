'use strict';

const fields = require('./agent-setup-fields');

const isOperatorLinkedRequest = (data) => data.agentType === 'OPERATOR_LINKED';

const applyTruthyFields = (agent, data) => {
  for (const field of fields.TRUTHY_AGENT_FIELDS) {
    if (data[field]) agent[field] = data[field];
  }
};

const applyAdminFields = (agent, data) => {
  for (const field of fields.NUMBER_FIELDS) {
    if (typeof data[field] === 'number') agent[field] = data[field];
  }
  if (typeof data.adminNotes === 'string') agent.adminNotes = data.adminNotes;
};

const successMessage = (data) => (
  isOperatorLinkedRequest(data)
    ? 'Operator-linked agent created and approved!'
    : 'Agent profile updated.'
);

const successBody = (agent, data) => ({
  success: true,
  message: successMessage(data),
  data: {
    agentId: agent.agentId,
    agentMongoId: agent._id,
    applicationStatus: agent.applicationStatus,
    agentType: agent.agentType,
  },
});

module.exports = {
  isOperatorLinkedRequest,
  applyTruthyFields,
  applyAdminFields,
  successBody,
};
