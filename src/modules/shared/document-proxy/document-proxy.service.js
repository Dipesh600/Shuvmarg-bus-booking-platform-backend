'use strict';

/**
 * document-proxy.service.js
 *
 * Orchestrates policy checks and S3 retrieval.
 * Returns a structured result object; the controller decides what to send over HTTP.
 *
 * Dependency injection via module-level object — patch storage.fetchS3Object
 * in tests without importing real AWS infrastructure.
 */

const policy  = require('./document-proxy.policy.js');
const storage = require('./document-proxy.storage.js');
const errors  = require('./document-proxy.errors.js');
const authorization = require('./document-proxy.authorization.js');

/**
 * Validate and normalise the raw key, check the prefix allowlist, then fetch
 * the object from S3.
 *
 * @param {string|undefined} rawKey  — value of req.query.key
 * @returns {Promise<{
 *   ok: boolean,
 *   errorCode?: string,
 *   status?: number,
 *   body?: object,
 *   s3Response?: import('@aws-sdk/client-s3').GetObjectCommandOutput,
 *   resolvedKey?: string,
 * }>}
 */
async function resolveDocument(rawKey, context) {
    // ── 1. Validate the key parameter ────────────────────────────────────────
    if (!rawKey || typeof rawKey !== 'string') {
        return {
            ok: false,
            errorCode: errors.MISSING_KEY,
            status: 400,
            body: { success: false, message: 'Missing required query parameter: key' },
        };
    }

    // ── 2. Normalise legacy full-URL keys ─────────────────────────────────
    const { resolvedKey } = policy.normaliseKey(rawKey);

    // ── 3. Prefix allowlist check ─────────────────────────────────────────
    const isAllowed = policy.isKeyAllowed(resolvedKey);

    if (!isAllowed) {
        return {
            ok: false,
            errorCode: errors.BLOCKED_PREFIX,
            status: 403,
            body: {
                success: false,
                message: 'Access denied: key path is not permitted.',
            },
        };
    }

    if (!await authorization.canReadDocument(resolvedKey, context)) {
        return { ok: false, status: 403, errorCode: 'DOCUMENT_PROXY_FORBIDDEN',
            body: { success: false, message: 'Access denied: document is not available to this account.' } };
    }

    // ── 4. Fetch from S3 ──────────────────────────────────────────────────
    try {
        const s3Response = await storage.fetchS3Object(resolvedKey);
        return { ok: true, resolvedKey, s3Response };
    } catch (error) {
        console.error('[documentProxy] S3 error:', {
            name:       error.name,
            code:       error.Code,
            statusCode: error.$metadata?.httpStatusCode,
        });

        if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
            return {
                ok: false,
                errorCode: errors.NOT_FOUND,
                status: 404,
                body: {
                    success: false,
                    message: 'Document not found. It may have been deleted or the key is incorrect.',
                },
            };
        }

        return {
            ok: false,
            errorCode: errors.UNEXPECTED,
            status: 500,
            body: { success: false, message: 'Failed to retrieve document.' },
        };
    }
}

module.exports = {
    resolveDocument,
};
