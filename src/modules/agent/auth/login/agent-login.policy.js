'use strict';
const { getEffectiveRoles } = require('../../../../shared/auth/account-role.policy');

const MAX_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;

const resolveRoles = (user) => (
  getEffectiveRoles(user)
);

const hasActiveLock = (user, now) => (
  Boolean(user.lockedUntil && user.lockedUntil > now)
);

const lockMinutes = (lockedUntil, nowMs) => (
  Math.ceil((lockedUntil - nowMs) / 60000)
);

const bannedMessage = (reason) => (
  reason
    ? `Your account has been suspended. Reason: ${reason}`
    : 'Your account has been suspended. Please contact support.'
);

const inactiveMessage = (reason) => (
  reason
    ? `Your account has been deactivated. Reason: ${reason}`
    : 'Your account has been deactivated. Please contact support.'
);

const attemptsRemaining = (failedCount) => MAX_ATTEMPTS - failedCount;
const shouldLock = (failedCount) => failedCount >= MAX_ATTEMPTS;
const lockUntilDate = (nowMs) => new Date(nowMs + LOCK_DURATION_MS);

module.exports = {
  MAX_ATTEMPTS,
  LOCK_DURATION_MS,
  resolveRoles,
  hasActiveLock,
  lockMinutes,
  bannedMessage,
  inactiveMessage,
  attemptsRemaining,
  shouldLock,
  lockUntilDate,
};
