'use strict';

const Agent = require('../../../../models/agentModel.js');

const findAgentByUserId = async (userId) => Agent.findOne({ user: userId });

const saveAgent = async (agent) => agent.save();

module.exports = {
    findAgentByUserId,
    saveAgent,
};
