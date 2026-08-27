'use strict';

const { isAssignmentStatus } = require('../../../shared/identity/agent-assignment-status');

const OBJECT_ID_RE = /^[a-f\d]{24}$/i;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const MAX_NOTE_LENGTH = 500;

const isObjectId = (value) => typeof value === 'string' && OBJECT_ID_RE.test(value);

const positiveInteger = (value, fallback) => {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const parseListQuery = (query = {}) => {
  const page = positiveInteger(query.page, 1);
  const requestedLimit = positiveInteger(query.limit, DEFAULT_PAGE_SIZE);
  const errors = [];
  if (page === null) errors.push('page must be a positive integer.');
  if (requestedLimit === null) errors.push('limit must be a positive integer.');
  if (query.brandId !== undefined && !isObjectId(query.brandId)) errors.push('brandId is invalid.');
  if (query.status !== undefined && !isAssignmentStatus(query.status)) errors.push('status is invalid.');
  return {
    errors,
    value: {
      page: page || 1,
      limit: Math.min(requestedLimit || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      brandId: query.brandId,
      status: query.status,
    },
  };
};

/** Suspend/revoke read one optional operator-authored field; all else is ignored. */
const parseOperatorNote = (body) => {
  const value = body && typeof body === 'object' ? body.note : undefined;
  if (value === undefined || value === null) return { note: null, errors: [] };
  if (typeof value !== 'string') return { note: null, errors: ['note must be a string.'] };
  const note = value.trim();
  if (note.length > MAX_NOTE_LENGTH) {
    return { note: null, errors: [`note must be at most ${MAX_NOTE_LENGTH} characters.`] };
  }
  return { note: note || null, errors: [] };
};

module.exports = {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  isObjectId,
  parseListQuery,
  parseOperatorNote,
};
