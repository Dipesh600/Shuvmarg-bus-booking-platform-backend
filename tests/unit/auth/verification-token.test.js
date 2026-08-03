'use strict';

/**
 * tests/unit/auth/verification-token.test.js
 *
 * Unit tests for utils/verificationToken.js
 * Verifies signed JWT issuance, validation, rejection rules, and documented reuse behavior.
 */

const { createTestSecret } = require('../../helpers/security-test-values');

process.env.VERIFICATION_TOKEN_SECRET ||= createTestSecret('verification-token');

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const verificationToken = require('../../../utils/verificationToken');

const AGENT_PURPOSE = 'AGENT_REGISTRATION';
const BUS_OWNER_PURPOSE = 'BUSOWNER_REGISTRATION';
const PHONE = '+9779800001234';

const issueExpiredToken = (phone, purpose) =>
  new Promise((resolve) => {
    const token = jwt.sign(
      { phone, purpose, nonce: 'expired-nonce' },
      process.env.VERIFICATION_TOKEN_SECRET,
      { expiresIn: '1s' },
    );
    setTimeout(() => resolve(token), 1100);
  });

test('verificationToken.issueVerificationToken', async (t) => {
  await t.test('issues signed JWT with phone, purpose, and unique nonce', () => {
    const t1 = verificationToken.issueVerificationToken(PHONE, AGENT_PURPOSE);
    const t2 = verificationToken.issueVerificationToken(PHONE, AGENT_PURPOSE);
    assert.equal(typeof t1, 'string');
    assert.ok(t1.length > 0);

    const d1 = jwt.verify(t1, process.env.VERIFICATION_TOKEN_SECRET);
    const d2 = jwt.verify(t2, process.env.VERIFICATION_TOKEN_SECRET);
    assert.equal(d1.phone, PHONE);
    assert.equal(d1.purpose, AGENT_PURPOSE);
    assert.notEqual(d1.nonce, d2.nonce);
  });
});

test('verificationToken.validateVerificationToken — rejection paths', async (t) => {
  await t.test('missing, null, empty, or non-JWT tokens are rejected', () => {
    assert.equal(verificationToken.validateVerificationToken(undefined, PHONE, AGENT_PURPOSE).valid, false);
    assert.equal(verificationToken.validateVerificationToken(null, PHONE, AGENT_PURPOSE).valid, false);
    assert.equal(verificationToken.validateVerificationToken('', PHONE, AGENT_PURPOSE).valid, false);
    assert.equal(verificationToken.validateVerificationToken('invalid-jwt', PHONE, AGENT_PURPOSE).valid, false);
  });

  await t.test('expired token is rejected', async () => {
    const expired = await issueExpiredToken(PHONE, AGENT_PURPOSE);
    const res = verificationToken.validateVerificationToken(expired, PHONE, AGENT_PURPOSE);
    assert.equal(res.valid, false);
    assert.match(res.error, /expired/i);
  });

  await t.test('phone mismatch or purpose mismatch is rejected', () => {
    const token = verificationToken.issueVerificationToken(PHONE, AGENT_PURPOSE);
    assert.equal(verificationToken.validateVerificationToken(token, '+9779899999999', AGENT_PURPOSE).valid, false);
    assert.equal(verificationToken.validateVerificationToken(token, PHONE, BUS_OWNER_PURPOSE).valid, false);
  });
});

test('verificationToken.validateVerificationToken — acceptance & reuse', async (t) => {
  await t.test('valid agent token with matching phone and purpose is accepted', () => {
    const token = verificationToken.issueVerificationToken(PHONE, AGENT_PURPOSE);
    const res = verificationToken.validateVerificationToken(token, PHONE, AGENT_PURPOSE);
    assert.equal(res.valid, true);
  });

  await t.test('token is time-limited but replayable within TTL window', () => {
    const token = verificationToken.issueVerificationToken(PHONE, AGENT_PURPOSE);
    assert.equal(verificationToken.validateVerificationToken(token, PHONE, AGENT_PURPOSE).valid, true);
    assert.equal(verificationToken.validateVerificationToken(token, PHONE, AGENT_PURPOSE).valid, true);
  });
});
