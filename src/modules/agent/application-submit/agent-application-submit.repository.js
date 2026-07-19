'use strict';

const Agent = require('../../../../models/agentModel.js');

const findAgentByUserId = async (userId) => {
    return Agent.findOne({ user: userId });
};

const saveAgent = async (agent) => {
    return agent.save();
};

module.exports = {
    findAgentByUserId,
    saveAgent,
};
