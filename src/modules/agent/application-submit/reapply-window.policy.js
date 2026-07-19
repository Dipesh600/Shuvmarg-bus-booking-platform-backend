'use strict';

const REAPPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

const getReapplyStatus = (agent) => {
    if (agent.isPermanentlyRejected) {
        return { isPermanentlyRejected: true };
    }
    
    if (agent.rejectedAt) {
        const rejectedTime = new Date(agent.rejectedAt).getTime();
        const timeSinceRejection = Date.now() - rejectedTime;
        
        if (timeSinceRejection < REAPPLY_WINDOW_MS) {
            const hoursLeft = Math.ceil((REAPPLY_WINDOW_MS - timeSinceRejection) / 3600000);
            return {
                isTooSoon: true,
                hoursLeft,
            };
        }
    }
    
    return { canReapply: true };
};

module.exports = {
    getReapplyStatus,
};
