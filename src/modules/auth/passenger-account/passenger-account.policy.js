'use strict';
const { getEffectiveRoles } = require('../../../shared/auth/account-role.policy');

/**
 * src/modules/auth/passenger-account/passenger-account.policy.js
 *
 * Pure decision functions for the passenger-account resolution module.
 *
 * PURITY CONTRACT
 * ---------------
 * No database access, no model imports, no password hashing,
 * no token generation, no HTTP response construction.
 *
 * ACCOUNT-STATUS POLICY
 * ---------------------
 * Follows the existing platform-wide middleware behaviour (verifyRoleFromDB):
 *
 *   deletedAt present → blocked
 *   status banned     → blocked
 *   status inactive   → blocked
 *   status invited    → blocked   (account not yet activated)
 *   status pending    → allowed   (mid-setup, not restricted)
 *   status active     → allowed
 *
 * Role-specific approval lives in Agent / BusOwner profile records,
 * not in User.status.
 */

// ── Constants ─────────────────────────────────────────────────────────────────

/** Statuses that block passenger role addition on an existing account. */
const BLOCKED_STATUSES = Object.freeze(['banned', 'inactive', 'invited']);

// ── Pure decisions ────────────────────────────────────────────────────────────

/**
 * Return true when the account is restricted and must not receive
 * additional passenger access.
 *
 * @param {Object} user - Lean user document (may include deletedAt and status).
 * @returns {boolean}
 */
const isAccountRestricted = (user) => {
  if (!user) return true;
  if (user.deletedAt) return true;
  return BLOCKED_STATUSES.includes(user.status);
};

/**
 * Return true when the user already holds the passenger role.
 * Uses the effective-role rule: roles[] when present, else legacy [role].
 *
 * An existing passenger must not have its activation timestamp rewritten.
 *
 * @param {Object} user - Lean user document.
 * @returns {boolean}
 */
const passengerRoleAlreadyGranted = (user) => {
  return getEffectiveRoles(user).includes('passenger');
};

/**
 * Return true when the supplied MongoDB error represents a race on the
 * globally unique phone index — i.e. two concurrent requests tried to
 * create the first User for the same phone number.
 *
 * Guards against false positives by checking:
 *   1. error.code === 11000  (MongoDB duplicate-key)
 *   2. The duplicate field is phone, not email, referralCode or another index.
 *
 * @param {Error} err
 * @returns {boolean}
 */
const isDuplicatePhoneError = (err) => {
  if (!err || err.code !== 11000) return false;
  const keyPattern = err.keyPattern || {};
  return Boolean(keyPattern.phone);
};

module.exports = {
  BLOCKED_STATUSES,
  isAccountRestricted,
  passengerRoleAlreadyGranted,
  isDuplicatePhoneError,
};
