'use strict';

const OBJECT_ID_RE = /^[a-f\d]{24}$/i;
const MAX_REASON_LENGTH = 500;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const MAX_PAGE = 1000;

const isObjectId = (value) => typeof value === 'string' && OBJECT_ID_RE.test(value);

const positiveInteger = (value, fallback) => {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const parseListQuery = (query = {}) => {
  const page = positiveInteger(query.page, 1);
  const requestedLimit = positiveInteger(query.limit, DEFAULT_LIMIT);
  const errors = [];
  if (page === null) errors.push('page must be a positive integer.');
  if (page !== null && page > MAX_PAGE) errors.push(`page must be at most ${MAX_PAGE}.`);
  if (requestedLimit === null) errors.push('limit must be a positive integer.');
  return {
    errors,
    value: {
      page: page || 1,
      limit: Math.min(requestedLimit || DEFAULT_LIMIT, MAX_LIMIT),
    },
  };
};

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
  parseListQuery,
  parseDeclineReason,
};
