'use strict';

const logger = require('../../../../utils/logger.js');
const service = require('./agent-application-submit.service.js');

const submitApplication = async (req, res) => {
    try {
        const userId = req.userInfo?.id;
        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized." });
        }

        const { termsAccepted } = req.body;

        const result = await service.processSubmit(userId, termsAccepted);

        if (!result.success) {
            const responsePayload = { success: false, message: result.message };
            if (result.errorCode) responsePayload.errorCode = result.errorCode;
            if (result.hoursLeft) responsePayload.hoursLeft = result.hoursLeft;
            if (result.errors) responsePayload.errors = result.errors;
            
            return res.status(result.status).json(responsePayload);
        }

        logger.info("agent: application submitted", { userId, agentId: result.data.agentId });

        return res.status(200).json({
            success: true,
            message: result.message,
            data: result.data,
        });
    } catch (error) {
        logger.error("agent: submitApplication error", { error: error.message });
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

module.exports = {
    submitApplication,
};
