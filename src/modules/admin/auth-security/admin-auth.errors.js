"use strict";

function authError(code, message, statusCode) {
  return Object.assign(new Error(message), { code, statusCode });
}

const invalidCredentials = () => authError(
  "INVALID_ADMIN_CREDENTIALS", "Invalid credentials or account unavailable", 401
);
const temporarilyLocked = () => authError(
  "ADMIN_TEMPORARILY_LOCKED", "Invalid credentials or account unavailable", 429
);
const enrollmentRequired = () => authError(
  "ADMIN_MFA_ENROLLMENT_REQUIRED", "Administrator activation is incomplete", 403
);

module.exports = { authError, enrollmentRequired, invalidCredentials, temporarilyLocked };
