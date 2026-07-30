"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createCorsOptions,
  parseConfiguredOrigins,
} = require("../../../src/shared/http/cors-options.js");

const evaluateOrigin = (options, origin) =>
  new Promise((resolve) => {
    options.origin(origin, (error, allowed) => resolve({ error, allowed }));
  });

test("configured origins are trimmed and empty entries are removed", () => {
  assert.deepEqual(
    parseConfiguredOrigins(" https://one.example, ,https://two.example "),
    ["https://one.example", "https://two.example"]
  );
});

test("non-browser clients without Origin are allowed", async () => {
  const result = await evaluateOrigin(createCorsOptions(), undefined);

  assert.equal(result.error, null);
  assert.equal(result.allowed, true);
});

test("configured and local development origins are allowed", async () => {
  const options = createCorsOptions({
    frontendUrl: "https://staging.shuvmarg.com",
  });

  const staging = await evaluateOrigin(options, "https://staging.shuvmarg.com");
  const local = await evaluateOrigin(options, "http://localhost:5173");
  assert.deepEqual(staging, { error: null, allowed: true });
  assert.deepEqual(local, { error: null, allowed: true });
});

test("unapproved origins return the operational 403 contract", async () => {
  const result = await evaluateOrigin(
    createCorsOptions({ frontendUrl: "https://staging.shuvmarg.com" }),
    "https://untrusted.example"
  );

  assert.equal(result.allowed, undefined);
  assert.equal(result.error.statusCode, 403);
  assert.equal(result.error.errorCode, "CORS_ORIGIN_DENIED");
  assert.deepEqual(result.error.responseBody, {
    success: false,
    message: "This browser origin is not allowed to access the API.",
    errorCode: "CORS_ORIGIN_DENIED",
  });
  assert.equal(result.error.message.includes("untrusted.example"), false);
});
