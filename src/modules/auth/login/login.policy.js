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
