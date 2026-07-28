'use strict';

/**
 * Canonical error codes for the document-proxy module.
 * Centralised here so every layer can reference the same constants.
 */

const MISSING_KEY       = 'DOCUMENT_PROXY_MISSING_KEY';
const BLOCKED_PREFIX    = 'DOCUMENT_PROXY_BLOCKED_PREFIX';
const NOT_FOUND         = 'DOCUMENT_PROXY_NOT_FOUND';
const UNEXPECTED        = 'DOCUMENT_PROXY_UNEXPECTED';

module.exports = {
    MISSING_KEY,
    BLOCKED_PREFIX,
    NOT_FOUND,
    UNEXPECTED,
};
