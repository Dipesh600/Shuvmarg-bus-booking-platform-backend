'use strict';

const crypto = require('node:crypto');

const deriveTestValue = (label) =>
  crypto
    .createHash('sha256')
    .update(`shuvmarg-test-fixture:${label}`)
    .digest('hex');

const createTestSecret = (label) =>
  deriveTestValue(`secret:${label}`);

const createTestPassword = (label) => {
  const requiredCharacters = String.fromCharCode(
    65, // A
    97, // a
    49, // 1
    33, // !
  );

  return `${requiredCharacters}${deriveTestValue(
    `credential:${label}`,
  ).slice(0, 16)}`;
};

module.exports = {
  createTestSecret,
  createTestPassword,
};
