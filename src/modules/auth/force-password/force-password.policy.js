'use strict';

const AppError = require('../../../shared/errors/app-error');
const errors = require('./force-password.errors');

const requireFields = (tempToken, newPassword) => {
  if (!tempToken || !newPassword) {
    throw errors.missingFieldsError();
  }
};

const requireForcePasswordPurpose = (decoded) => {
  if (decoded.purpose !== 'FORCE_PASSWORD_CHANGE') {
    throw errors.invalidTokenPurposeError();
  }
};

const requireValidPassword = (passwordCheck) => {
  if (!passwordCheck.valid) {
    throw new AppError('Invalid Password', 400, {
      success: false,
      message: passwordCheck.errors[0],
      errors: passwordCheck.errors,
    });
  }
};

module.exports = {
  requireFields,
  requireForcePasswordPurpose,
  requireValidPassword,
};
