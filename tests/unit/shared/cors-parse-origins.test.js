/**
 * tests/unit/shared/cors-parse-origins.test.js
 *
 * Tests for parseConfiguredOrigins and origin precedence logic.
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

function testOrigin(corsOptions, origin) {
  let allowed = false;
  let err = null;
  corsOptions.origin(origin, (e, ok) => {
    err = e;
    allowed = ok ?? false;
  });
  return { allowed, error: err };
}

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

  it("deduplicates repeated origins", () => {
    const result = parseConfiguredOrigins(
      "https://staging.shuvmarg.com, https://staging.shuvmarg.com ,https://admin-staging.shuvmarg.com"
    );
    assert.deepEqual(result, [
      "https://staging.shuvmarg.com",
      "https://admin-staging.shuvmarg.com",
    ]);
  });

  it("returns empty array for empty string or undefined", () => {
    assert.deepEqual(parseConfiguredOrigins(""), []);
    assert.deepEqual(parseConfiguredOrigins(), []);
  });
});

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

  it("falls back to FRONTEND_URL when CORS_ALLOWED_ORIGINS is whitespace-only", () => {
    const opts = createCorsOptions({
      corsAllowedOrigins: "   \t  \n  ",
      frontendUrl: "https://legacy.shuvmarg.com",
    });
    const { allowed } = testOrigin(opts, "https://legacy.shuvmarg.com");
    assert.equal(allowed, true, "FRONTEND_URL origin must be allowed when CORS_ALLOWED_ORIGINS is whitespace-only");
  });

  it("allows only static localhost origins when both vars are empty or whitespace", () => {
    const opts = createCorsOptions({ corsAllowedOrigins: "  ", frontendUrl: "  " });
    for (const o of STATIC_ORIGINS) {
      const { allowed } = testOrigin(opts, o);
      assert.equal(allowed, true, `${o} should be in static allowlist`);
    }
    const { allowed } = testOrigin(opts, "https://external.example.com");
    assert.equal(allowed, false, "external origin must be rejected when no env var is set");
  });
});
