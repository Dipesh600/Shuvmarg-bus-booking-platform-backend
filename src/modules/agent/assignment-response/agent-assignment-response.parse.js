'use strict';

const OBJECT_ID_RE = /^[a-f\d]{24}$/i;
const MAX_REASON_LENGTH = 500;

const isObjectId = (value) => typeof value === 'string' && OBJECT_ID_RE.test(value);

/** Decline reads exactly one optional body field. Everything else is ignored. */
const parseDeclineReason = (body) => {
  const value = body && typeof body === 'object' ? body.reason : undefined;
  if (value === undefined || value === null) return { reason: null, errors: [] };
  if (typeof value !== 'string') {
    return { reason: null, errors: ['reason must be a string.'] };
  }
  const reason = value.trim();
  if (reason.length > MAX_REASON_LENGTH) {
    return { reason: null, errors: [`reason must be at most ${MAX_REASON_LENGTH} characters.`] };
  }
  return { reason: reason || null, errors: [] };
};

module.exports = {
  isObjectId,
  parseDeclineReason,
};
