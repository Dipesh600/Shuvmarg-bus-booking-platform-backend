'use strict';

const Agent = require('../../../../models/agentModel');
const { normaliseKey } = require('./document-proxy.policy');
const { canRead } = require('../../agent/application-document-upload/document-security');

// Context comes only from the route's verified user/admin middleware.
async function canReadDocument(key, { user, admin } = {}) {
    const isAdmin = admin?.id && ['SUPER_ADMIN', 'ADMIN', 'SUB_ADMIN'].includes(admin.role);
    if (!isAdmin && (!user?.id || user.activeRole !== 'agent')) return false;
    if (key.length > 2048) return false;
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const query = isAdmin
        ? { 'documents.fileKey': { $regex: `^(?:https?://[^/]+/)?${escaped}(?:\\?[^\\r\\n]*)?$` } }
        : { user: user.id };
    const agent = await Agent.findOne(query).select('documents suspendedAt applicationStatus').lean();
    if (!agent || (!isAdmin && (agent.suspendedAt || agent.applicationStatus === 'SUSPENDED'))) return false;
    return (agent.documents || []).some(document =>
        typeof document.fileKey === 'string' && normaliseKey(document.fileKey).resolvedKey === key && canRead(document));
}

module.exports = { canReadDocument };
