'use strict';

process.env.SECRET_KEY ||= 'test-only-secret-32chars-minimum!!';

const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const phoneGuard = require('../../utils/phoneGuard');
const otpHelper = require('../../utils/otpHelper');
const enumGuard = require('../../utils/enumGuard');
const passwordValidator = require('../../utils/passwordValidator');
const tokenService = require('../../utils/tokenService');
const repository = require('../../src/modules/driver/auth/password-reset/driver-password-reset.repository');
const service = require('../../src/modules/driver/auth/password-reset/driver-password-reset.service');

const patch = (object, key, replacement, restores) => {
  const original = object[key];
  object[key] = replacement;
  restores.push(() => { object[key] = original; });
};
const driver = () => ({
  _id: 'driver-user',
  phone: '9800001001',
  role: 'driver',
  roles: ['driver'],
  status: 'active',
  deletedAt: null,
  toObject() { return { ...this }; },
});
const activeTarget = (user = driver()) => ({
  user,
  hasAnyProfile: true,
  hasActiveProfile: true,
  hasInvitedProfile: false,
});


module.exports = { test, assert, bcrypt, phoneGuard, otpHelper, enumGuard, passwordValidator, tokenService, repository, service, patch, driver, activeTarget };
