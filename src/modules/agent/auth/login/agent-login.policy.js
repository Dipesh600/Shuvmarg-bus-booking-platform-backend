'use strict';

const MAX_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;

const resolveRoles = (user) => (
  user.roles && user.roles.length > 0 ? user.roles : [user.role]
);

const hasActiveLock = (user, now = new Date()) => (
  Boolean(user.lockedUntil && user.lockedUntil > now)
);

const lockMinutes = (lockedUntil, nowMs = Date.now()) => (
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
const lockUntilDate = () => new Date(Date.now() + LOCK_DURATION_MS);

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
