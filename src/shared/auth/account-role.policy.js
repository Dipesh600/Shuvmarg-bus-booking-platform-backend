'use strict';

/**
 * src/shared/auth/account-role.policy.js
 *
 * Platform-wide identity policy for role-based password requirements.
 *
 * PURPOSE
 * -------
 * Defines which roles require a password and provides the canonical
 * effective-role resolution rule used by the User model validator,
 * the passenger-account module, and every privileged-role-granting flow.
 *
 * EFFECTIVE-ROLE RULE
 * -------------------
 * Use roles[] whenever it is present, including an empty array.
 * Only fall back to [role] when the field is missing (legacy documents).
 * This handles:
 *   - Modern multi-role documents (roles[] populated)
 *   - Legacy documents where roles is missing but role is set
 *   - New documents created before pre-save runs (Mongoose validators
 *     execute BEFORE pre-save hooks in Mongoose 7+)
 *
 * PURITY CONTRACT
 * ---------------
 * This module must remain free of:
 *   - Database access
 *   - Model imports
 *   - Service imports
 *   - Repository imports
 *   - HTTP response construction
 *   - Password hashing
 *   - Token generation
 *   - Logging of secrets
 *
 * It may be safely imported by models, services, repositories and controllers.
 */

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Roles that require a password to be present.
 * Passenger-only accounts are explicitly allowed to be passwordless.
 * Super-admin authentication is a separate system and is not included here.
 */
const ACCOUNT_ROLES = Object.freeze(['passenger', 'agent', 'busOwner', 'conductor', 'driver']);

const PRIVILEGED_ROLES = Object.freeze([
  'agent',
  'busOwner',
  'conductor',
  'driver',
]);

// ── Pure helpers ──────────────────────────────────────────────────────────────

/**
 * Resolve the effective roles for a user-like object.
 *
 * Returns an array without duplicates.
 * Does not mutate the supplied object.
 *
 * @param {Object} userLike - Object with optional `roles` array and `role` string.
 * @returns {string[]} Effective role array.
 */
const getEffectiveRoles = (userLike) => {
  if (!userLike) return [];
  const rolesArr = userLike.roles;
  if (Array.isArray(rolesArr)) {
    return rolesArr.every(role => ACCOUNT_ROLES.includes(role)) ? [...new Set(rolesArr)] : [];
  }
  if (rolesArr !== undefined) return []; // Malformed role state fails closed.
  const legacyRole = userLike.role;
  if (ACCOUNT_ROLES.includes(legacyRole)) {
    return [legacyRole];
  }
  return [];
};

/**
 * Return true when at least one of the supplied roles is privileged.
 *
 * @param {string[]} roles
 * @returns {boolean}
 */
const requiresPasswordForRoles = (roles) => {
  if (!Array.isArray(roles) || roles.length === 0) return false;
  return roles.some((r) => PRIVILEGED_ROLES.includes(r));
};

/**
 * Return true when the user-like object holds at least one privileged role.
 * Uses the effective-role resolution rule.
 *
 * @param {Object} userLike - Object with optional `roles` array and `role` string.
 * @returns {boolean}
 */
const hasPrivilegedRole = (userLike) => {
  return requiresPasswordForRoles(getEffectiveRoles(userLike));
};

/**
 * Return true when the user may remain without a password.
 * A user may remain passwordless only when all of their effective roles
 * are non-privileged (i.e. passenger-only or no roles at all).
 *
 * @param {Object} userLike - Object with optional `roles` array and `role` string.
 * @returns {boolean}
 */
const canRemainPasswordless = (userLike) => {
  return !hasPrivilegedRole(userLike);
};

/** Select only a currently granted role, even when the original role was revoked. */
const requireSessionRole = (user, requestedRole) => {
  const roles = getEffectiveRoles(user);
  const role = requestedRole || (roles.includes(user?.role) ? user.role : roles[0]);
  if (!role || !roles.includes(role)) throw new Error('ROLE_REVOKED');
  return role;
};

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  ACCOUNT_ROLES,
  requireSessionRole,
  PRIVILEGED_ROLES,
  getEffectiveRoles,
  requiresPasswordForRoles,
  hasPrivilegedRole,
  canRemainPasswordless,
};
