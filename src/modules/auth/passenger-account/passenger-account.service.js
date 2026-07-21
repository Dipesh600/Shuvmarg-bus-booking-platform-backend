'use strict';

/**
 * src/modules/auth/passenger-account/passenger-account.service.js
 *
 * Resolves a verified phone number to a passenger account.
 *
 * PRECONDITION
 * ------------
 * The caller MUST have verified phone ownership before calling this service.
 * The function name communicates this requirement explicitly.
 * This service does NOT verify OTPs, issue tokens, or construct HTTP responses.
 *
 * THREE RESOLUTION CASES
 * ----------------------
 * A. New phone   → create minimal passenger User, handle concurrent creation race.
 * B. Existing user without passenger role → atomically add passenger role.
 * C. Existing user already has passenger role → return existing account (idempotent).
 *
 * ACCOUNT-STATE INVARIANT
 * -----------------------
 * Restricted accounts (deleted, banned, inactive, invited) are never silently
 * upgraded. The caller receives a controlled domain error and must not create
 * a duplicate User for the same phone.
 *
 * CONCURRENCY SAFETY
 * ------------------
 * New-user race: duplicate-key (11000 on phone) → re-read winning User.
 * Role-grant race: conditional update filter → null return → re-read.
 * In both cases the final state converges to one passenger User.
 */

const repository = require('./passenger-account.repository');
const policy = require('./passenger-account.policy');
const helpers = require('./passenger-account.helpers');

// ── Main resolver ─────────────────────────────────────────────────────────────

/**
 * Resolve a verified phone to a passenger account.
 *
 * PRECONDITION: The caller has already verified phone ownership via OTP.
 * This service does not verify OTPs, issue tokens, or build HTTP responses.
 *
 * @param {Object} input
 * @param {string} input.phone - Raw phone string (any supported format).
 * @param {Date}   input.now   - Timestamp used for roleActivatedAt.
 * @returns {Promise<Object>} Lean user document with passenger role.
 * @throws {AppError} On missing phone, restricted account, or unrecoverable race.
 */
const resolvePassengerAccountAfterPhoneVerification = async ({ phone: rawPhone, now }) => {
  const normalizedPhone = helpers.requirePhone(rawPhone);

  // Look up any existing User for this phone, including soft-deleted records.
  // Using includeDeleted:true prevents creating a duplicate when a deleted
  // identity shares the same phone number.
  const existing = await repository.findIdentityByPhone(rawPhone);

  // ── Case A: New phone ─────────────────────────────────────────────────────
  if (!existing) {
    return helpers.createMinimalPassenger(normalizedPhone, rawPhone, now);
  }

  // ── Existing account: enforce platform-wide restrictions ──────────────────
  helpers.assertNotRestricted(existing);

  // ── Case C: Already a passenger ───────────────────────────────────────────
  // An existing passenger with a missing activation timestamp is NOT silently
  // modified by this resolver — a separate migration handles legacy data.
  if (policy.passengerRoleAlreadyGranted(existing)) {
    return existing;
  }

  // ── Case B: Existing user without passenger role ──────────────────────────
  return helpers.grantPassengerRole(existing, now);
};

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  resolvePassengerAccountAfterPhoneVerification,
};
