'use strict';

/**
 * Shape checks for values arriving from a request body — the mechanical half of
 * validating assignment terms, split out from the terms file that gives them
 * meaning so neither has to carry both.
 */

/** A 24-hex id. Narrower than mongoose's isValid, which accepts any 12 chars. */
const OBJECT_ID_RE = /^[a-f\d]{24}$/i;

/**
 * Bound on a narrowing list. Not a business rule — a document bound. An operator
 * with more routes than this wants ALL_BUSES, not a list.
 */
const MAX_SCOPE_IDS = 200;

const isObjectId = (value) => typeof value === 'string' && OBJECT_ID_RE.test(value);

/** Duplicates are dropped rather than rejected; a repeated id says nothing new. */
const parseIdList = (value, field, errors) => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    errors.push(`${field} must be an array of ids.`);
    return [];
  }
  if (value.length > MAX_SCOPE_IDS) {
    errors.push(`${field} cannot hold more than ${MAX_SCOPE_IDS} ids.`);
    return [];
  }
  if (!value.every(isObjectId)) {
    errors.push(`${field} must contain only valid ids.`);
    return [];
  }
  return [...new Set(value)];
};

/**
 * A bounded number, or undefined when absent or unusable.
 *
 * undefined for a rejected value, not the clamped bound: clamping would store a
 * number the operator never chose, and the accompanying error is what the caller
 * acts on.
 */
const parseNumber = (source, field, errors, { integer = true, min, max, nullable = false }) => {
  const value = source[field];
  if (value === undefined) return undefined;
  if (value === null && nullable) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    errors.push(`permissions.${field} must be a number.`);
    return undefined;
  }
  if (integer && !Number.isInteger(value)) {
    errors.push(`permissions.${field} must be a whole number.`);
    return undefined;
  }
  if (value < min || (max !== undefined && value > max)) {
    errors.push(`permissions.${field} must be between ${min} and ${max ?? 'unbounded'}.`);
    return undefined;
  }
  return value;
};

module.exports = {
  MAX_SCOPE_IDS,
  isObjectId,
  parseIdList,
  parseNumber,
};
