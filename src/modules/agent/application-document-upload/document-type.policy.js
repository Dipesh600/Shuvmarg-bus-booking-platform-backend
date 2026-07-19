'use strict';

const { VALID_DOCUMENT_TYPES } = require('./agent-application-document-upload.policy.js');

const isValidDocumentType = (type) => VALID_DOCUMENT_TYPES.includes(type);

module.exports = {
    isValidDocumentType,
    VALID_DOCUMENT_TYPES,
};
