"use strict";

const { test, describe, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const speakeasy = require("speakeasy");
const { decryptSecret, encryptSecret, generateOneTimeToken, hashToken } = require("../../src/modules/admin/auth-security/admin-auth.crypto");
const { createEnrollment, matchedCounter } = require("../../src/modules/admin/auth-security/admin-mfa.service");
const { assertStrongPassword } = require("../../src/modules/admin/auth-security/admin-password.policy");
const { isValidAdminId } = require("../../src/modules/admin/auth-security/admin-identity.policy");
const { issueAccessToken } = require("../../src/modules/admin/auth-security/admin-login.service");

describe("admin authentication security primitives", () => {
  let originalKey;
  beforeEach(() => {
    originalKey = process.env.ADMIN_MFA_ENCRYPTION_KEY;
    process.env.ADMIN_MFA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  });
  afterEach(() => { process.env.ADMIN_MFA_ENCRYPTION_KEY = originalKey; });

  test("encrypts MFA secrets with authenticated encryption", () => {
    const encrypted = encryptSecret("SECRET");
    assert.notEqual(encrypted, "SECRET");
    assert.equal(decryptSecret(encrypted), "SECRET");
    const parts = encrypted.split(":");
    parts[3] = `${parts[3][0] === "A" ? "B" : "A"}${parts[3].slice(1)}`;
    assert.throws(() => decryptSecret(parts.join(":")));
  });

  test("creates a scannable enrollment without returning the plaintext secret field", async () => {
    const result = await createEnrollment("root@example.com");
    assert.match(result.qrCodeDataUrl, /^data:image\/png;base64,/);
    assert.ok(result.manualEntryKey);
    assert.equal(Object.hasOwn(result, "secret"), false);
  });

  test("returns the actual accepted TOTP counter", () => {
    const secret = speakeasy.generateSecret().base32;
    const now = Date.now();
    const token = speakeasy.totp({ secret, encoding: "base32", time: now / 1000 });
    assert.equal(matchedCounter(secret, token, now), Math.floor(now / 1000 / 30));
  });

  test("uses high entropy one-time tokens and deterministic hashes", () => {
    const first = generateOneTimeToken();
    const second = generateOneTimeToken();
    assert.notEqual(first, second);
    assert.equal(hashToken(first), hashToken(first));
  });

  test("enforces the privileged account password policy", () => {
    assert.throws(() => assertStrongPassword("Weakpass1!"), /at least 12/);
    assert.doesNotThrow(() => assertStrongPassword("LongEnough#Password2026"));
  });

  test("accepts named admin IDs without breaking legacy IDs", () => {
    assert.equal(isValidAdminId("SM-ADM-DIPESH"), true);
    assert.equal(isValidAdminId("SUMA-ADM-001"), true);
    assert.equal(isValidAdminId("SM-ADMIN-DIPESH"), false);
  });

  test("issues administrator access tokens for one hour", () => {
    const originalSecret = process.env.SECRET_KEY;
    process.env.SECRET_KEY = "admin-session-test-secret";
    try {
      const token = issueAccessToken({
        _id: "507f1f77bcf86cd799439011", adminId: "SM-ADM-TEST",
        email: "admin@example.com", role: "super_admin", sessionVersion: 1,
      });
      const decoded = jwt.decode(token);
      assert.equal(decoded.exp - decoded.iat, 60 * 60);
    } finally {
      process.env.SECRET_KEY = originalSecret;
    }
  });
});
