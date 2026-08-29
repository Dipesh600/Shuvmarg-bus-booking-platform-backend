'use strict';

const { isOutletType } = require('../../../shared/identity/agent-enums');

/**
 * What an agent may change about themselves.
 *
 * Allowlist, not a denylist. A denylist on a schema this wide is a standing
 * invitation to privilege escalation: every field added to Agent later would be
 * writable by the agent by default, including `scope`, `applicationStatus`,
 * `code`, `commissionRate` and `createdByOwnerId`. Anything not named here is
 * silently dropped, not rejected — a client sending an extra key gets a 200 and
 * no write, which is the behaviour that does not leak the field list.
 */
const AGENT_EDITABLE_FIELDS = Object.freeze([
  'outletType',
  'district',
  'municipality',
  'placeName',
  'businessName',
  'shopAddress',
]);

/** Fields that live on User, not Agent, but are edited through the same call. */
const USER_EDITABLE_FIELDS = Object.freeze(['name']);

const MAX_TEXT_LENGTH = 200;
const MIN_NAME_LENGTH = 3;

const trimmedOrNull = (value) => {
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
};

/**
 * Split an untrusted body into the Agent patch, the User patch, and errors.
 *
 * Uses Object.hasOwn against a fixed list rather than iterating the body, so a
 * body carrying `__proto__` or `constructor` contributes nothing.
 */
const buildProfilePatch = (body) => {
  const source = body && typeof body === 'object' ? body : {};
  const agentPatch = {};
  const userPatch = {};
  const errors = [];

  for (const field of AGENT_EDITABLE_FIELDS) {
    if (!Object.hasOwn(source, field)) continue;
    const value = trimmedOrNull(source[field]);
    if (value === undefined) {
      errors.push(`${field} must be a string or null.`);
      continue;
    }
    if (value !== null && value.length > MAX_TEXT_LENGTH) {
      errors.push(`${field} must be ${MAX_TEXT_LENGTH} characters or fewer.`);
      continue;
    }
    if (field === 'outletType' && value !== null && !isOutletType(value)) {
      errors.push('outletType is not a recognised outlet type.');
      continue;
    }
    agentPatch[field] = value;
  }

  for (const field of USER_EDITABLE_FIELDS) {
    if (!Object.hasOwn(source, field)) continue;
    const value = trimmedOrNull(source[field]);
    if (value === undefined || value === null) {
      errors.push('name must be a non-empty string.');
      continue;
    }
    if (value.length < MIN_NAME_LENGTH) {
      errors.push(`name must be at least ${MIN_NAME_LENGTH} characters.`);
      continue;
    }
    if (value.length > MAX_TEXT_LENGTH) {
      errors.push(`name must be ${MAX_TEXT_LENGTH} characters or fewer.`);
      continue;
    }
    userPatch[field] = value;
  }

  return {
    agentPatch,
    userPatch,
    errors,
    isEmpty: Object.keys(agentPatch).length === 0 && Object.keys(userPatch).length === 0,
  };
};

module.exports = {
  AGENT_EDITABLE_FIELDS,
  MAX_TEXT_LENGTH,
  MIN_NAME_LENGTH,
  USER_EDITABLE_FIELDS,
  buildProfilePatch,
  trimmedOrNull,
};
