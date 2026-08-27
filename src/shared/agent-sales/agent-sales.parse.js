'use strict';

const OBJECT_ID_RE = /^[a-f\d]{24}$/i;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const MAX_PAGE = 1000;

const positiveInteger = (value, fallback) => {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const parsePage = (query = {}) => {
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

const isObjectId = (value) => typeof value === 'string' && OBJECT_ID_RE.test(value);

module.exports = { DEFAULT_LIMIT, MAX_LIMIT, MAX_PAGE, isObjectId, parsePage };
