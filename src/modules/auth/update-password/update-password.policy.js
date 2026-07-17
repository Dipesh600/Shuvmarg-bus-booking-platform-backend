'use strict';

const errors = require('./update-password.errors');

const requireAuthenticatedUser = (userId) => {
  if (!userId) throw errors.unauthorizedError();
};

const requirePasswords = (oldPassword, newPassword) => {
  if (!oldPassword || !newPassword) {
    throw errors.missingPasswordsError();
  }
};

const requireValidNewPassword = (passwordCheck) => {
  if (!passwordCheck.valid) {
    throw errors.invalidNewPasswordError(passwordCheck);
  }
};

module.exports = {
  requireAuthenticatedUser,
  requirePasswords,
  requireValidNewPassword,
};
