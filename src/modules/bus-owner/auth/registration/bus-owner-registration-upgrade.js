'use strict';

/**
 * src/modules/bus-owner/auth/registration/bus-owner-registration-upgrade.js
 *
 * Persistence helpers for the bus-owner role upgrade path.
 * Handles both passworded and passwordless upgrade cases.
 * Imported only by bus-owner-registration-completion.service.js.
 */

const bcrypt = require('bcryptjs');
const passwordValidator = require('../../../../../utils/passwordValidator');
const repository = require('./bus-owner-registration.repository');
const errors = require('./bus-owner-registration.errors');

/**
 * Persist the bus-owner role upgrade for a User who ALREADY HAS a password.
 * The existing password hash is preserved — no replacement.
 */
const persistUpgradeWithExistingPassword = (user, now) =>
  repository.upgradeUserToBusOwner(user._id, now);

/**
 * Persist bus-owner role AND password for a passwordless User.
 * Validates and hashes the submitted password, then writes both atomically.
 *
 * The `upgradePasswordlessUserToBusOwner` filter confirms the account is still
 * passwordless at write time.  If a concurrent request established a password
 * between our check and this write, the update returns null.
 * On null: re-read the account — if it now has the role (concurrent success),
 * return it; otherwise surface a controlled error.
 */
const persistUpgradePasswordless = async (user, password, now) => {
  if (!password) throw errors.passwordRequiredForRoleUpgradeError();
  const check = passwordValidator.validatePassword(password);
  if (!check.valid) throw errors.invalidPasswordError(check);
  const hashedPassword = await bcrypt.hash(password, 12);
  const updated = await repository.upgradePasswordlessUserToBusOwner({
    userId: user._id,
    hashedPassword,
    activatedAt: now,
  });
  if (updated) return updated;
  // Concurrent request established a password — re-read and use that state.
  const reread = await repository.findBusOwnerByUser(user._id);
  if (reread) {
    const savedUser = await repository.upgradeUserToBusOwner(user._id, now);
    return savedUser || reread;
  }
  throw errors.passwordRequiredForRoleUpgradeError();
};

/**
 * Determine upgrade path by checking actual password presence via DB.
 *
 * IMPORTANT: `user` comes from checkPhoneForRole() which selects:
 *   name role roles status phone
 * The password field is excluded (select:false).  Inspecting user.password
 * here would ALWAYS be undefined even for users with passwords.
 * Use hasUsablePassword() instead.
 *
 * Behaviour:
 *   - Has password → add role only, keep existing hash.
 *   - No password → require submitted password, validate, hash, write atomically.
 */
const persistUpgrade = async (user, password, now) => {
  const alreadyHasPassword = await repository.hasUsablePassword(user._id);
  if (alreadyHasPassword) {
    return persistUpgradeWithExistingPassword(user, now);
  }
  return persistUpgradePasswordless(user, password, now);
};

module.exports = {
  persistUpgrade,
};
