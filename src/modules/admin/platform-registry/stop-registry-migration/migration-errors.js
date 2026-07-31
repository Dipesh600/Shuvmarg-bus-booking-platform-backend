"use strict";

/**
 * Shared error constructors for the Stop Registry migration.
 * All error objects include a machine-readable errorCode and a human message.
 */

function scanError(stop, errorCode, message) {
  return {
    stopId: stop._id,
    code: stop.code,
    name: stop.name,
    errorCode,
    message
  };
}

function indexConfigError(indexName, message) {
  return {
    indexName,
    errorCode: "INDEX_CONFIG_INVALID",
    message
  };
}

function verificationError(message) {
  return { errorCode: "VERIFICATION_FAILED", message };
}

module.exports = { scanError, indexConfigError, verificationError };
