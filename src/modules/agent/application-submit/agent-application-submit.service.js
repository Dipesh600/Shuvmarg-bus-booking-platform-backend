'use strict';

const repository = require('./agent-application-submit.repository.js');
const policy = require('./agent-application-submit.policy.js');
const reapplyPolicy = require('./reapply-window.policy.js');
const validator = require('./application-completeness.validator.js');

const processReapply = (agent) => {
    const reapplyStatus = reapplyPolicy.getReapplyStatus(agent);
    
    if (reapplyStatus.isPermanentlyRejected) {
        return {
            success: false,
            status: 403,
            message: "Your application has been permanently rejected. Please contact support.",
            errorCode: "PERMANENTLY_REJECTED",
        };
    }
    
    if (reapplyStatus.isTooSoon) {
        return {
            success: false,
            status: 429,
            message: `You can reapply after ${reapplyStatus.hoursLeft} hour(s).`,
            errorCode: "REAPPLY_TOO_SOON",
            hoursLeft: reapplyStatus.hoursLeft,
        };
    }
    
    // Reset to DRAFT so they can edit and resubmit
    agent.applicationStatus = "DRAFT";
    return null;
};

const processSubmit = async (userId, termsAccepted) => {
    const agent = await repository.findAgentByUserId(userId);
    if (!agent) {
        return {
            success: false,
            status: 404,
            message: "No application found. Please start your application first.",
        };
    }

    if (agent.applicationStatus === "REJECTED") {
        const rejectionError = processReapply(agent);
        if (rejectionError) return rejectionError;
    }

    if (!policy.isSubmittableStatus(agent.applicationStatus)) {
        return {
            success: false,
            status: 400,
            message: `Application is in "${agent.applicationStatus}" status and cannot be submitted.`,
        };
    }

    if (!termsAccepted) {
        return {
            success: false,
            status: 400,
            message: "You must accept the Terms and Conditions to submit your application.",
        };
    }

    const validationResult = validator.validateCompleteness(agent);
    if (!validationResult.isValid) {
        return {
            success: false,
            status: 400,
            message: "Application is incomplete. Please fix the following:",
            errors: validationResult.errors,
        };
    }

    agent.applicationStatus = "PENDING";
    agent.submittedAt       = new Date();
    agent.termsAcceptedAt   = new Date();
    agent.rejectionReason   = null;
    agent.moreInfoRequest   = null;
    agent.moreInfoRequestedAt = null;

    await repository.saveAgent(agent);

    return {
        success: true,
        status: 200,
        message: "Application submitted successfully! We'll review it within 2–3 business days.",
        data: {
            agentId: agent.agentId,
            applicationStatus: agent.applicationStatus,
            submittedAt: agent.submittedAt,
        },
    };
};

module.exports = {
    processSubmit,
    processReapply,
};
