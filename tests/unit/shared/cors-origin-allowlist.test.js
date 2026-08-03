/**
 * tests/unit/shared/cors-origin-allowlist.test.js
 *
 * Unit tests for the CORS origin-allowlist logic in cors-options.js.
 * Tests cover: CORS_ALLOWED_ORIGINS parsing, FRONTEND_URL fallback,
 * trimming, empty-value removal, allowed/rejected origins, credentials flag.
 */

"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  createCorsOptions,
  parseConfiguredOrigins,
} = require("../../../src/shared/http/cors-options.js");

const STATIC_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "http://localhost:5176",
  "http://localhost:5177",
  "http://localhost:3000",
  "http://localhost:4173",
];

/** Simulate the cors origin callback synchronously. */
function testOrigin(corsOptions, origin) {
  let allowed = false;
  let err = null;
  corsOptions.origin(origin, (e, ok) => {
    err = e;
    allowed = ok ?? false;
  });
  return { allowed, error: err };
}

// ── parseConfiguredOrigins ────────────────────────────────────────────────────

describe("parseConfiguredOrigins", () => {
  it("splits comma-separated values", () => {
    const result = parseConfiguredOrigins(
      "https://staging.shuvmarg.com,https://admin-staging.shuvmarg.com"
    );
    assert.deepEqual(result, [
      "https://staging.shuvmarg.com",
      "https://admin-staging.shuvmarg.com",
    ]);
  });

  it("trims whitespace from each entry", () => {
    const result = parseConfiguredOrigins(
      "  https://staging.shuvmarg.com , https://admin-staging.shuvmarg.com  "
    );
    assert.deepEqual(result, [
      "https://staging.shuvmarg.com",
      "https://admin-staging.shuvmarg.com",
    ]);
  });

  it("removes empty entries (double-comma, trailing comma)", () => {
    const result = parseConfiguredOrigins(
      "https://staging.shuvmarg.com,,https://admin-staging.shuvmarg.com,"
    );
    assert.ok(!result.includes(""), "no empty strings");
    assert.equal(result.length, 2);
  });

  it("returns empty array for empty string", () => {
    assert.deepEqual(parseConfiguredOrigins(""), []);
  });

  it("returns empty array when called with no argument", () => {
    assert.deepEqual(parseConfiguredOrigins(), []);
  });
});

// ── createCorsOptions — origin precedence ─────────────────────────────────────

describe("createCorsOptions — origin precedence", () => {
  it("uses CORS_ALLOWED_ORIGINS when both vars are provided", () => {
    const opts = createCorsOptions({
      corsAllowedOrigins: "https://staging.shuvmarg.com",
      frontendUrl: "https://legacy.shuvmarg.com",
    });
    const { allowed: stagingAllowed } = testOrigin(opts, "https://staging.shuvmarg.com");
    const { allowed: legacyAllowed } = testOrigin(opts, "https://legacy.shuvmarg.com");
    assert.equal(stagingAllowed, true, "CORS_ALLOWED_ORIGINS origin must be allowed");
    assert.equal(legacyAllowed, false, "FRONTEND_URL origin must NOT appear when CORS_ALLOWED_ORIGINS is set");
  });

  it("falls back to FRONTEND_URL when CORS_ALLOWED_ORIGINS is empty", () => {
    const opts = createCorsOptions({
      corsAllowedOrigins: "",
      frontendUrl: "https://legacy.shuvmarg.com",
    });
    const { allowed } = testOrigin(opts, "https://legacy.shuvmarg.com");
    assert.equal(allowed, true, "FRONTEND_URL origin must be allowed when CORS_ALLOWED_ORIGINS is absent");
  });

  it("allows only static localhost origins when both vars are empty strings", () => {
    const opts = createCorsOptions({ corsAllowedOrigins: "", frontendUrl: "" });
    for (const o of STATIC_ORIGINS) {
      const { allowed } = testOrigin(opts, o);
      assert.equal(allowed, true, `${o} should be in static allowlist`);
    }
    const { allowed } = testOrigin(opts, "https://external.example.com");
    assert.equal(allowed, false, "external origin must be rejected when no env var is set");
  });
});

// ── createCorsOptions — request matching ─────────────────────────────────────

describe("createCorsOptions — request origin matching", () => {
  const opts = createCorsOptions({
    corsAllowedOrigins:
      "https://staging.shuvmarg.com,https://admin-staging.shuvmarg.com," +
      "https://agent-staging.shuvmarg.com,https://operator-staging.shuvmarg.com",
    frontendUrl: "",
  });

  it("allows all four staging frontends", () => {
    const frontends = [
      "https://staging.shuvmarg.com",
      "https://admin-staging.shuvmarg.com",
      "https://agent-staging.shuvmarg.com",
      "https://operator-staging.shuvmarg.com",
    ];
    for (const origin of frontends) {
      const { allowed } = testOrigin(opts, origin);
      assert.equal(allowed, true, `${origin} should be allowed`);
    }
  });

  it("allows a request with no Origin header (curl, Postman, mobile)", () => {
    const { allowed } = testOrigin(opts, undefined);
    assert.equal(allowed, true);
  });

  it("allows all static localhost dev origins", () => {
    for (const o of STATIC_ORIGINS) {
      const { allowed } = testOrigin(opts, o);
      assert.equal(allowed, true, `${o} should be allowed`);
    }
  });

  it("rejects an unknown browser origin", () => {
    const { allowed, error } = testOrigin(opts, "https://evil.example.com");
    assert.equal(allowed, false);
    assert.ok(error, "an error should be returned for rejected origins");
  });
});

// ── createCorsOptions — options shape ────────────────────────────────────────

describe("createCorsOptions — returned options shape", () => {
  it("has credentials:true", () => {
    const opts = createCorsOptions();
    assert.equal(opts.credentials, true, "credentials must be true — wildcard CORS is incompatible");
  });

  it("includes OPTIONS in the allowed methods", () => {
    const opts = createCorsOptions();
    assert.ok(opts.methods.includes("OPTIONS"), "OPTIONS required for preflight");
  });

  it("returns optionsSuccessStatus 200", () => {
    const opts = createCorsOptions();
    assert.equal(opts.optionsSuccessStatus, 200);
  });
});
