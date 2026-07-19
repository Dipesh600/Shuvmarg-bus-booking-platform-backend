const logger = require("../../../../utils/logger.js");
const service = require("./agent-application-draft.service.js");

const saveApplicationDraft = async (req, res) => {
    try {
        const userId = req.userInfo?.id;
        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized." });
        }

        const result = await service.processDraftSave(userId, req.body);

        if (!result.success) {
            return res.status(result.status).json({
                success: result.success,
                message: result.message,
            });
        }

        logger.info("agent: draft saved", { userId, agentId: result.agentId });

        return res.status(result.status).json({
            success: result.success,
            message: result.message,
            data: result.data,
        });
    } catch (error) {
        logger.error("agent: saveApplicationDraft error", { error: error.message });
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

module.exports = {
    saveApplicationDraft,
};
