"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const generatePassword = require("../../handlers/passwordGenerator");
const adminMiddleware = require("../../middleware/adminMiddleware");
const {
  resolveOperatorLoginUrl,
  temporaryCredentialTtlMs,
} = require("../../src/modules/admin/bus-owner-management/operator-portal.config");

test("admin-created operator access security", async (t) => {
  await t.test("temporary passwords are long and contain every required character group", () => {
    for (let index = 0; index < 20; index += 1) {
      const password = generatePassword(12);
      assert.equal(password.length, 12);
      assert.match(password, /[A-Z]/);
      assert.match(password, /[a-z]/);
      assert.match(password, /[0-9]/);
      assert.match(password, /[!@#$%&]/);
    }
  });

  await t.test("operator links use local development by default and configured HTTPS in production", () => {
    assert.equal(resolveOperatorLoginUrl({ NODE_ENV: "test" }), "http://localhost:3000/login");
    assert.equal(resolveOperatorLoginUrl({
      NODE_ENV: "production",
      OPERATOR_APP_URL: "https://operator-staging.shuvmarg.com/",
    }), "https://operator-staging.shuvmarg.com/login");
    assert.throws(
      () => resolveOperatorLoginUrl({ NODE_ENV: "production" }),
      (error) => error.code === "OPERATOR_APP_URL_MISSING"
    );
    assert.throws(
      () => resolveOperatorLoginUrl({ NODE_ENV: "production", OPERATOR_APP_URL: "http://operator.example.com" }),
      (error) => error.code === "OPERATOR_APP_URL_INSECURE"
    );
    assert.equal(temporaryCredentialTtlMs({ TEMPORARY_CREDENTIAL_TTL_HOURS: "6" }), 21600000);
  });

  await t.test("a test-bypass header cannot replace an admin token", async () => {
    const req = { headers: { "x-test-bypass": "true" } };
    let response;
    const res = {
      status(statusCode) { response = { statusCode }; return this; },
      json(body) { response.body = body; return this; },
    };
    let nextCalled = false;
    await adminMiddleware(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(response.statusCode, 401);
  });
});
