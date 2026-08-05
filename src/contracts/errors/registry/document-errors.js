"use strict";

const DOCUMENT_ERRORS = Object.freeze({
  DOCUMENT_SLOT_INVALID: Object.freeze({
    statusCode: 400,
    message: "Document slot name is invalid.",
    domain: "document",
    retryable: false,
  }),
  DOCUMENT_NOT_FOUND: Object.freeze({
    statusCode: 404,
    message: "Requested document was not found.",
    domain: "document",
    retryable: false,
  }),
});

module.exports = { DOCUMENT_ERRORS };
