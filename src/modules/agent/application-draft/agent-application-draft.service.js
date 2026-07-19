const repository = require("./agent-application-draft.repository.js");
const policy = require("./agent-application-draft.policy.js");
const updater = require("./draft-updater.js");

const processDraftSave = async (userId, payload) => {
    let agent = await repository.findAgentByUserId(userId);
    if (!agent) {
        agent = repository.createAgentForUserId(userId);
    }

    if (!policy.isEditableStatus(agent.applicationStatus)) {
        return {
            success: false,
            status: 400,
            message: `Application cannot be edited in "${agent.applicationStatus}" status.`,
        };
    }

    updater.updateDraftFields(agent, payload);

    await repository.saveAgent(agent);

    return {
        success: true,
        status: 200,
        message: "Application draft saved.",
        data: {
            agentId: agent.agentId,
            applicationStatus: agent.applicationStatus,
        },
        agentId: agent.agentId, // returned to controller for logging
    };
};

module.exports = {
    processDraftSave,
};
