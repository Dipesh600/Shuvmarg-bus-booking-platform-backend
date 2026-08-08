/**
 * tests/unit/shared/cors-origin-allowlist.test.js
 *
 * Tests for request origin matching and CORS options shape.
 */

"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  createCorsOptions,
} = require("../../../src/shared/http/cors-options.js");

const STATIC_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "http://localhost:5176",
  "http://localhost:5177",
  "http://localhost:3000",
  "http://localhost:3001",
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
