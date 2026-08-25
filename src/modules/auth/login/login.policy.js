'use strict';

const AppError = require('../../../shared/errors/app-error');

exports.verifyAccountStatus = (user) => {
  // === SOFT-DELETE CHECK ===
  if (user.deletedAt) {
    throw new AppError(
      'This account has been deactivated. Please contact support for assistance.',
      403,
      {
        success: false,
        message: 'This account has been deactivated. Please contact support for assistance.',
        errorCode: 'ACCOUNT_DELETED',
        contact: {
          email: 'support@shuvmarg.com',
          phone: '+977-9800000000',
        },
      }
    );
  }

  // === ACCOUNT LOCK CHECK ===
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutesLeft = Math.ceil((user.lockedUntil - Date.now()) / 60000);
    throw new AppError(
      `Account temporarily locked due to too many failed attempts. Try again in ${minutesLeft} minute(s).`,
      429,
      {
        success: false,
        message: `Account temporarily locked due to too many failed attempts. Try again in ${minutesLeft} minute(s).`,
        errorCode: 'ACCOUNT_LOCKED',
      }
    );
  }

  // === BANNED CHECK ===
  if (user.status === 'banned') {
    const message = user.suspensionReason
      ? `Your account has been banned. Reason: ${user.suspensionReason}`
      : 'Your account has been banned.';
    throw new AppError(message, 403, {
      success: false,
      message,
      errorCode: 'ACCOUNT_BANNED',
      reason: user.suspensionReason || null,
      bannedAt: user.suspendedAt || null,
      contact: {
        email: 'support@shuvmarg.com',
        phone: '+977-9800000000',
      },
    });
  }

  // === SUSPENDED / INACTIVE CHECK ===
  if (user.status === 'inactive') {
    const message = user.suspensionReason
      ? `Your account has been suspended. Reason: ${user.suspensionReason}`
      : 'Your account has been suspended.';
    throw new AppError(message, 403, {
      success: false,
      message,
      errorCode: 'ACCOUNT_SUSPENDED',
      reason: user.suspensionReason || null,
      suspendedAt: user.suspendedAt || null,
      contact: {
        email: 'support@shuvmarg.com',
        phone: '+977-9800000000',
      },
    });
  }

  // === INVITED BUT NOT YET ACTIVATED ===
  if (user.status === 'invited') {
    throw new AppError(
      'Your account has not been activated yet. Please check your SMS for activation instructions.',
      403,
      {
        success: false,
        message: 'Your account has not been activated yet. Please check your SMS for activation instructions.',
        errorCode: 'ACCOUNT_NOT_ACTIVATED',
      }
    );
  }
};

/**
 * X-App-Source values mapped from their lowercased form to the canonical role
 * name stored on the user.
 *
 * The header arrives already lowercased (login.controller.js), so matching it
 * against a list containing the camel-cased 'busOwner' meant that one value
 * could never match: the role gate fell open and a caller without the busOwner
 * role was issued a passenger session with 200 instead of being refused. Every
 * other role is lowercase, so only busOwner was affected.
 *
 * Keying on the lowercased form fixes that without making the header
 * case-sensitive for clients, which would break the ones already sending
 * lowercase.
 *
 * A Map, not an object: the key comes straight off an untrusted header, and on a
 * plain object `X-App-Source: constructor` would resolve truthy off the
 * prototype chain. A Map has no inherited keys.
 */
const APP_SOURCE_ROLES = new Map([
  ['passenger', 'passenger'],
  ['busowner', 'busOwner'],
  ['agent', 'agent'],
  ['conductor', 'conductor'],
  ['driver', 'driver'],
]);

/**
 * Resolve the activeRole for a login request.
 *
 * `appSource` is normalised here rather than trusted to arrive normalised. The
 * bug above existed precisely because a security gate depended on a caller-side
 * invariant; a second caller passing the raw header would reopen it.
 *
 * @param {object} user      - Mongoose User document
 * @param {string} appSource - Raw or lowercased X-App-Source header value (or '')
 * @returns {string}         - The resolved activeRole
 * @throws {AppError}        - 403 ROLE_NOT_REGISTERED when appSource is a valid
 *                             role name but the user does not hold that role
 */
exports.resolveActiveRole = (user, appSource) => {
  const key = typeof appSource === 'string' ? appSource.trim().toLowerCase() : '';
  const requestedRole = APP_SOURCE_ROLES.get(key) || null;
  const userRoles = user.roles && user.roles.length > 0 ? user.roles : [user.role];

  if (requestedRole) {
    if (!userRoles.includes(requestedRole)) {
      throw new AppError(
        `You don't have a ${requestedRole} account. Please register first.`,
        403,
        {
          success: false,
          message: `You don't have a ${requestedRole} account. Please register first.`,
          errorCode: 'ROLE_NOT_REGISTERED',
        }
      );
    }
    return requestedRole;
  }

  return user.role || 'passenger';
};
