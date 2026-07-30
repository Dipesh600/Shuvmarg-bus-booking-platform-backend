"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const previousFrontendUrl = process.env.FRONTEND_URL;
const previousSecretKey = process.env.SECRET_KEY;
const previousVerificationTokenSecret = process.env.VERIFICATION_TOKEN_SECRET;

process.env.FRONTEND_URL = "https://staging.shuvmarg.com";
process.env.SECRET_KEY = "cors-security-contract-test-secret";
process.env.VERIFICATION_TOKEN_SECRET = "cors-contract-verification-token-test-secret";

const app = require("../../index");

test.after(() => {
  if (previousFrontendUrl === undefined) delete process.env.FRONTEND_URL;
  else process.env.FRONTEND_URL = previousFrontendUrl;

  if (previousSecretKey === undefined) delete process.env.SECRET_KEY;
  else process.env.SECRET_KEY = previousSecretKey;

  if (previousVerificationTokenSecret === undefined) delete process.env.VERIFICATION_TOKEN_SECRET;
  else process.env.VERIFICATION_TOKEN_SECRET = previousVerificationTokenSecret;
});

test("requests without an Origin remain available to mobile and server clients", async () => {
  const response = await request(app).get("/testing");

  assert.equal(response.status, 200);
  assert.equal(response.headers["x-powered-by"], undefined);
});

test("an approved staging browser origin receives the CORS contract", async () => {
  const response = await request(app)
    .options("/health")
    .set("Origin", "https://staging.shuvmarg.com")
    .set("Access-Control-Request-Method", "GET");

  assert.equal(response.status, 200);
  assert.equal(
    response.headers["access-control-allow-origin"],
    "https://staging.shuvmarg.com"
  );
  assert.equal(response.headers["access-control-allow-credentials"], "true");
  assert.equal(response.headers["x-powered-by"], undefined);
});

test("an unapproved preflight receives a stable 403 without CORS access", async () => {
  const response = await request(app)
    .options("/health")
    .set("Origin", "https://untrusted.example")
    .set("Access-Control-Request-Method", "GET");

  assert.equal(response.status, 403);
  assert.deepEqual(response.body, {
    success: false,
    message: "This browser origin is not allowed to access the API.",
    errorCode: "CORS_ORIGIN_DENIED",
  });
  assert.equal(response.headers["access-control-allow-origin"], undefined);
  assert.equal(response.headers["x-powered-by"], undefined);
});

test("an unapproved normal request uses the same safe rejection contract", async () => {
  const response = await request(app)
    .get("/testing")
    .set("Origin", "https://untrusted.example");

  assert.equal(response.status, 403);
  assert.equal(response.body.errorCode, "CORS_ORIGIN_DENIED");
  assert.equal(response.headers["access-control-allow-origin"], undefined);
  assert.equal(response.headers["x-powered-by"], undefined);
});
