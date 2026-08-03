'use strict';

/**
 * tests/unit/auth/registration-continuation-contract.test.js
 *
 * Unit-level contract tests for the verificationToken utility used by both
 * Agent and Bus-Owner registration flows.
 *
 * These tests do NOT require a database connection or running server.
 * They verify the token issuance/validation contract that the registration
 * services rely on to enforce the Step 2 → Step 3 continuation.
 *
 * DOCUMENTED BEHAVIOR (replayed for future readers):
 *
 * Response envelope:
 *   The backend verifyOTP service returns:
 *     { statusCode, responseBody: { success, message, verificationToken, ... } }
 *   The controller calls:
 *     respond(res, result.statusCode, result.responseBody)
 *   Therefore the HTTP response body carries verificationToken at the root level.
 *   Frontends must read: const data = await res.json(); → data.verificationToken
 *   NOT: data.data.verificationToken
 *
 * Token reuse:
 *   The token is a signed 30-minute JWT. It is NOT single-use by itself.
 *   The OTP record (isUsed:true, 30-min window) acts as a supporting guard.
 *   Duplicate-account protection incidentally prevents a second full registration,
 *   but that is a business rule, not a token-consumption mechanism.
 */

const assert = require('node:assert/strict');
const test = require('node:test');
const jwt = require('jsonwebtoken');

// The utility under test — used by both agent and bus-owner OTP services.
const verificationToken = require('../../../utils/verificationToken');

// Real purpose constants from each module's policy.
const AGENT_PURPOSE = 'AGENT_REGISTRATION';
const BUS_OWNER_PURPOSE = 'BUSOWNER_REGISTRATION';

const PHONE = '+9779800001234';
const OTHER_PHONE = '+9779800009999';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Issue a token that has already expired (waits 1.1 s). */
const issueExpiredToken = (phone, purpose) => {
  return new Promise((resolve) => {
    const secret = process.env.VERIFICATION_TOKEN_SECRET;
    const token = jwt.sign(
      { phone, purpose, nonce: 'test-nonce' },
      secret,
      { expiresIn: '1s' },
    );
    setTimeout(() => resolve(token), 1100);
  });
};

// ─── Suite: issueVerificationToken ──────────────────────────────────────────

test('verificationToken.issueVerificationToken', async (t) => {
  await t.test('returns a non-empty string', () => {
    const token = verificationToken.issueVerificationToken(PHONE, AGENT_PURPOSE);
    assert.equal(typeof token, 'string');
    assert.ok(token.length > 0);
  });

  await t.test('JWT contains the phone claim at root', () => {
    const secret = process.env.VERIFICATION_TOKEN_SECRET;
    const token = verificationToken.issueVerificationToken(PHONE, AGENT_PURPOSE);
    const decoded = jwt.verify(token, secret);
    assert.equal(decoded.phone, PHONE);
  });

  await t.test('JWT contains the purpose claim at root', () => {
    const secret = process.env.VERIFICATION_TOKEN_SECRET;
    const token = verificationToken.issueVerificationToken(PHONE, AGENT_PURPOSE);
    const decoded = jwt.verify(token, secret);
    assert.equal(decoded.purpose, AGENT_PURPOSE);
  });

  await t.test('JWT contains a nonce claim', () => {
    const secret = process.env.VERIFICATION_TOKEN_SECRET;
    const token = verificationToken.issueVerificationToken(PHONE, AGENT_PURPOSE);
    const decoded = jwt.verify(token, secret);
    assert.ok(decoded.nonce, 'nonce claim is present');
    assert.equal(typeof decoded.nonce, 'string');
  });

  await t.test('two tokens issued for the same phone+purpose carry different nonces', () => {
    const secret = process.env.VERIFICATION_TOKEN_SECRET;
    const t1 = verificationToken.issueVerificationToken(PHONE, AGENT_PURPOSE);
    const t2 = verificationToken.issueVerificationToken(PHONE, AGENT_PURPOSE);
    const d1 = jwt.verify(t1, secret);
    const d2 = jwt.verify(t2, secret);
    assert.notEqual(d1.nonce, d2.nonce);
  });

  await t.test('agent and bus-owner tokens for the same phone differ in purpose claim', () => {
    const secret = process.env.VERIFICATION_TOKEN_SECRET;
    const agentTok = verificationToken.issueVerificationToken(PHONE, AGENT_PURPOSE);
    const busTok = verificationToken.issueVerificationToken(PHONE, BUS_OWNER_PURPOSE);
    const dAgent = jwt.verify(agentTok, secret);
    const dBus = jwt.verify(busTok, secret);
    assert.equal(dAgent.purpose, AGENT_PURPOSE);
    assert.equal(dBus.purpose, BUS_OWNER_PURPOSE);
  });
});

// ─── Suite: validateVerificationToken — rejection paths ─────────────────────

test('verificationToken.validateVerificationToken — rejection paths', async (t) => {
  await t.test('undefined is rejected with "Verification token is required"', () => {
    const result = verificationToken.validateVerificationToken(undefined, PHONE, AGENT_PURPOSE);
    assert.equal(result.valid, false);
    assert.match(result.error, /Verification token is required/i);
  });

  await t.test('null is rejected', () => {
    const result = verificationToken.validateVerificationToken(null, PHONE, AGENT_PURPOSE);
    assert.equal(result.valid, false);
    assert.match(result.error, /Verification token is required/i);
  });

  await t.test('empty string is rejected', () => {
    const result = verificationToken.validateVerificationToken('', PHONE, AGENT_PURPOSE);
    assert.equal(result.valid, false);
    assert.match(result.error, /Verification token is required/i);
  });

  await t.test('non-JWT garbage string is rejected as invalid', () => {
    const result = verificationToken.validateVerificationToken('not-a-jwt', PHONE, AGENT_PURPOSE);
    assert.equal(result.valid, false);
    assert.match(result.error, /Invalid verification token/i);
  });

  await t.test('token signed with wrong secret is rejected', () => {
    const bad = jwt.sign({ phone: PHONE, purpose: AGENT_PURPOSE }, 'wrong-secret');
    const result = verificationToken.validateVerificationToken(bad, PHONE, AGENT_PURPOSE);
    assert.equal(result.valid, false);
    assert.match(result.error, /Invalid verification token/i);
  });

  await t.test('expired token is rejected with session-expired message', async () => {
    const expired = await issueExpiredToken(PHONE, AGENT_PURPOSE);
    const result = verificationToken.validateVerificationToken(expired, PHONE, AGENT_PURPOSE);
    assert.equal(result.valid, false);
    assert.match(result.error, /expired/i);
  });

  await t.test('valid token rejected when phone does not match', () => {
    const token = verificationToken.issueVerificationToken(PHONE, AGENT_PURPOSE);
    const result = verificationToken.validateVerificationToken(token, OTHER_PHONE, AGENT_PURPOSE);
    assert.equal(result.valid, false);
    assert.match(result.error, /phone number/i);
  });

  await t.test('agent token rejected on bus-owner purpose', () => {
    const token = verificationToken.issueVerificationToken(PHONE, AGENT_PURPOSE);
    const result = verificationToken.validateVerificationToken(token, PHONE, BUS_OWNER_PURPOSE);
    assert.equal(result.valid, false);
    assert.match(result.error, /registration type/i);
  });

  await t.test('bus-owner token rejected on agent purpose', () => {
    const token = verificationToken.issueVerificationToken(PHONE, BUS_OWNER_PURPOSE);
    const result = verificationToken.validateVerificationToken(token, PHONE, AGENT_PURPOSE);
    assert.equal(result.valid, false);
    assert.match(result.error, /registration type/i);
  });
});

// ─── Suite: validateVerificationToken — acceptance paths ────────────────────

test('verificationToken.validateVerificationToken — acceptance paths', async (t) => {
  await t.test('valid agent token with correct phone and purpose is accepted', () => {
    const token = verificationToken.issueVerificationToken(PHONE, AGENT_PURPOSE);
    const result = verificationToken.validateVerificationToken(token, PHONE, AGENT_PURPOSE);
    assert.equal(result.valid, true);
    assert.equal(result.error, undefined);
  });

  await t.test('valid bus-owner token with correct phone and purpose is accepted', () => {
    const token = verificationToken.issueVerificationToken(PHONE, BUS_OWNER_PURPOSE);
    const result = verificationToken.validateVerificationToken(token, PHONE, BUS_OWNER_PURPOSE);
    assert.equal(result.valid, true);
    assert.equal(result.error, undefined);
  });
});

// ─── Suite: Token reuse documentation ───────────────────────────────────────

test('verificationToken reuse lifecycle — documented behavior', async (t) => {
  /**
   * DOCUMENTED: The verificationToken is time-limited (30 min) but NOT single-use.
   *
   * There is no jti blocklist, consumed-at flag, or server-side record that marks
   * a token as used. The same token will pass validateVerificationToken on every
   * call within its TTL window.
   *
   * Replay protection in practice comes from:
   *   1. The OTP record (isUsed:true, 30-min window) — prevents a second verifyOTP
   *      for the same phone without requesting a new OTP.
   *   2. Duplicate-account DB constraints — a second successful full registration
   *      for the same phone+role is rejected by the business logic.
   *
   * If explicit single-use token enforcement is required in future, introduce a
   * jti blocklist or a consumed_at flag on the OTP document.
   */

  await t.test('the same valid token passes validation on repeated calls within its TTL', () => {
    const token = verificationToken.issueVerificationToken(PHONE, AGENT_PURPOSE);

    const first  = verificationToken.validateVerificationToken(token, PHONE, AGENT_PURPOSE);
    const second = verificationToken.validateVerificationToken(token, PHONE, AGENT_PURPOSE);
    const third  = verificationToken.validateVerificationToken(token, PHONE, AGENT_PURPOSE);

    assert.equal(first.valid,  true, 'first validation passes');
    assert.equal(second.valid, true, 'second validation passes — token is replayable');
    assert.equal(third.valid,  true, 'third validation passes — no server-side consumption');
  });
});

// ─── Suite: Response envelope documentation test ────────────────────────────

test('verifyOTP response envelope — verificationToken is at root (not nested)', async (t) => {
  /**
   * This test verifies the shape of the responseBody object that the OTP service
   * returns (and that the controller passes verbatim to respond()).
   *
   * The HTTP response body from POST /auth/agent/verifyOTP is:
   *   { success, message, exists, userName, existingRoles, verificationToken }
   *
   * The frontend must therefore read:
   *   const data = await res.json();
   *   const verificationToken = data.verificationToken;   ← CORRECT
   *   const verificationToken = data.data.verificationToken; ← WRONG (no "data" wrapper)
   */

  await t.test('agent verifyOTP service returns verificationToken at responseBody root', async () => {
    const otpService = require('../../../src/modules/agent/auth/registration/agent-registration-otp.service');
    const otpHelper  = require('../../../utils/otpHelper');
    const phoneGuard = require('../../../utils/phoneGuard');

    const savedVerify     = otpHelper.verifyOTPCode;
    const savedCheckPhone = phoneGuard.checkPhoneForRole;

    // Stub external dependencies so no DB or SMS is involved
    otpHelper.verifyOTPCode       = async () => ({ valid: true });
    phoneGuard.checkPhoneForRole  = async () => ({ exists: false, hasRole: false, user: null });

    try {
      const result = await otpService.verifyOTP({ phone: PHONE, otp: '123456' });

      assert.equal(result.statusCode, 200, 'status code is 200');

      const body = result.responseBody;
      assert.equal(body.success, true, 'success flag is true');
      assert.equal(typeof body.verificationToken, 'string', 'verificationToken is a string at body root');
      assert.ok(body.verificationToken.length > 0, 'verificationToken is non-empty');

      // Confirm it is NOT wrapped under a nested "data" property
      assert.ok(
        body.data === undefined || body.data?.verificationToken === undefined,
        'verificationToken is NOT nested under body.data',
      );
    } finally {
      otpHelper.verifyOTPCode      = savedVerify;
      phoneGuard.checkPhoneForRole = savedCheckPhone;
    }
  });

  await t.test('bus-owner verifyOTP service returns verificationToken at responseBody root', async () => {
    const otpService = require('../../../src/modules/bus-owner/auth/registration/bus-owner-registration-otp.service');
    const otpHelper  = require('../../../utils/otpHelper');
    const phoneGuard = require('../../../utils/phoneGuard');

    const savedVerify     = otpHelper.verifyOTPCode;
    const savedCheckPhone = phoneGuard.checkPhoneForRole;

    otpHelper.verifyOTPCode       = async () => ({ valid: true });
    phoneGuard.checkPhoneForRole  = async () => ({ exists: false, hasRole: false, user: null });

    try {
      const result = await otpService.verifyOTP({ phone: PHONE, otp: '123456' });

      assert.equal(result.statusCode, 200, 'status code is 200');

      const body = result.responseBody;
      assert.equal(body.success, true, 'success flag is true');
      assert.equal(typeof body.verificationToken, 'string', 'verificationToken is a string at body root');
      assert.ok(body.verificationToken.length > 0, 'verificationToken is non-empty');

      assert.ok(
        body.data === undefined || body.data?.verificationToken === undefined,
        'verificationToken is NOT nested under body.data',
      );
    } finally {
      otpHelper.verifyOTPCode      = savedVerify;
      phoneGuard.checkPhoneForRole = savedCheckPhone;
    }
  });
});
