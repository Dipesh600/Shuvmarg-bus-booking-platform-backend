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
      ...details
    }
  };
}

module.exports = { formatError };
