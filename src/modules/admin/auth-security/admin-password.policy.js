"use strict";

function passwordError(password) {
  if (typeof password !== "string" || password.length < 12) {
    return "Password must be at least 12 characters long.";
  }
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    return "Password must contain uppercase, lowercase and numeric characters.";
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return "Password must contain at least one special character.";
  }
  return null;
}

function assertStrongPassword(password) {
  const error = passwordError(password);
  if (error) {
    const problem = new Error(error);
    problem.code = "WEAK_ADMIN_PASSWORD";
    throw problem;
  }
}

module.exports = { assertStrongPassword, passwordError };
