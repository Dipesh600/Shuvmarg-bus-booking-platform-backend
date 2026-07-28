'use strict';

/**
 * src/modules/auth/passenger-account/passenger-account.helpers.js
 *
 * Internal case helpers for resolvePassengerAccountAfterPhoneVerification.
 * Not part of the public API — imported only by passenger-account.service.js.
 */

const { normalizePhone } = require('../../../../utils/phoneGuard');
const errors = require('./passenger-account.errors');
const policy = require('./passenger-account.policy');
const repository = require('./passenger-account.repository');

/**
 * Assert the phone resolves to a non-empty normalized string.
 * @param {string} rawPhone
 * @returns {string} normalized phone
 */
const requirePhone = (rawPhone) => {
  const normalized = normalizePhone(rawPhone);
  if (!normalized) throw errors.missingPhoneError();
  return normalized;
};

/**
 * Assert the account is not restricted.
 * @param {Object} user - Lean user document.
 */
const assertNotRestricted = (user) => {
  if (policy.isAccountRestricted(user)) {
    throw errors.restrictedAccountError();
  }
};

/**
 * Atomically add the passenger role to an existing user.
 * Handles the case where a concurrent request already granted the role
 * (addPassengerRoleIfMissing returns null).
 *
 * @param {Object} existingUser - Lean user document from findIdentityByPhone.
 * @param {Date}   now
 * @returns {Promise<Object>} Lean user document with passenger role.
 */
const grantPassengerRole = async (existingUser, now) => {
  const updated = await repository.addPassengerRoleIfMissing(existingUser._id, now);
  if (updated) {
    return updated.toObject ? updated.toObject() : updated;
  }
  // Another concurrent request already granted the role — re-read current state.
  const reread = await repository.findByIdForPassengerResolution(existingUser._id);
  if (!reread) {
    throw errors.unexpectedIdentityStateError(
      'user disappeared after concurrent role grant',
    );
  }
  return reread;
};

/**
 * Create a minimal passenger User, recovering from a concurrent creation race.
 *
 * @param {string} normalizedPhone
 * @param {string} rawPhone        - Preserved for post-race re-read lookup.
 * @param {Date}   now
 * @returns {Promise<Object>} Lean user document.
 */
const createMinimalPassenger = async (normalizedPhone, rawPhone, now) => {
  try {
    const saved = await repository.createMinimalPassenger({
      phone: normalizedPhone,
      role: 'passenger',
      roles: ['passenger'],
      roleActivatedAt: { passenger: now },
      phoneVerified: true,
      isVerified: true,
      status: 'active',
    });
    return saved.toObject ? saved.toObject() : saved;
  } catch (err) {
    // ── Duplicate-phone creation race recovery ──────────────────────────────
    if (!policy.isDuplicatePhoneError(err)) throw err;

    const winner = await repository.findIdentityByPhoneAfterRace(rawPhone);
    if (!winner) throw errors.raceRecoveryFailedError();

    assertNotRestricted(winner);

    if (policy.passengerRoleAlreadyGranted(winner)) return winner;

    return grantPassengerRole(winner, now);
  }
};

module.exports = {
  requirePhone,
  assertNotRestricted,
  grantPassengerRole,
  createMinimalPassenger,
};
