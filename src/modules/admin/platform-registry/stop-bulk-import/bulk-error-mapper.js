"use strict";

function formatError(entry, errorCode, message, details = {}) {
  return {
    index: entry?._sourceIndex ?? null,
    code: entry?.code ?? null,
    name: entry?.name ?? null,
    errorCode,
    message,
    details: {
      province: entry?.province,
      district: entry?.district,
      municipality: entry?.municipality,
      parentStopId: entry?.parentStopId,
      ...details,
    },
  };
}

function detectDuplicateConflict(writeError) {
  const keyPattern =
    writeError?.keyPattern ||
    writeError?.err?.keyPattern ||
    writeError?.errorResponse?.keyPattern ||
    {};

  if (keyPattern.code) return "code";
  if (keyPattern._normalizedIdentity) return "identity";

  const msg = String(writeError?.errmsg || writeError?.message || "");
  if (msg.includes("code_1")) return "code";
  if (msg.includes("_normalizedIdentity_1")) return "identity";

  return "unknown";
}

function mapBulkWriteError(writeError, entry) {
  if (writeError?.code === 11000) {
    const conflict = detectDuplicateConflict(writeError);
    if (conflict === "code") {
      return formatError(
        entry,
        "STOP_CODE_CONFLICT",
        "A stop with this code already exists."
      );
    }
    if (conflict === "identity") {
      return formatError(
        entry,
        "STOP_IDENTITY_CONFLICT",
        "A stop with the same geographic identity already exists."
      );
    }
    return formatError(
      entry,
      "DUPLICATE_STOP",
      "The stop conflicts with an existing registry record."
    );
  }

  return formatError(
    entry,
    "BULK_WRITE_ERROR",
    "The stop could not be imported."
  );
}

module.exports = { formatError, detectDuplicateConflict, mapBulkWriteError };
