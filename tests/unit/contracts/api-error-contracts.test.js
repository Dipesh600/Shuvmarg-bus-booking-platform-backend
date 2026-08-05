"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  API_ERROR_CODES,
  API_ERROR_REGISTRY,
  getApiErrorDefinition,
  ApiError,
} = require("../../../src/contracts");

test("api error registry uniqueness and immutability", async (t) => {
  await t.test("every registered code has statusCode, message, domain, and retryable", () => {
    for (const [code, def] of Object.entries(API_ERROR_REGISTRY)) {
      assert.equal(typeof def.statusCode, "number");
      assert.equal(typeof def.message, "string");
      assert.equal(typeof def.domain, "string");
      assert.equal(typeof def.retryable, "boolean");
      assert.equal(code, API_ERROR_CODES[code]);
    }
  });

  await t.test("preserved PR #138 public read error codes exist", () => {
    const pr138Codes = [
      "READ_INVALID_ID",
      "READ_INVALID_PAGE",
      "READ_INVALID_LIMIT",
      "READ_INVALID_FILTER",
      "READ_INVALID_SEARCH",
      "UNAUTHORIZED_ADMIN",
      "UNAUTHORIZED_OWNER",
      "READ_FORBIDDEN",
      "FLEET_NOT_FOUND",
    ];
    for (const code of pr138Codes) {
      assert.ok(API_ERROR_REGISTRY[code], `Code '${code}' must be in registry`);
    }
  });

  await t.test("unknown error code throws descriptive error", () => {
    assert.throws(
      () => getApiErrorDefinition("NON_EXISTENT_CODE"),
      /Unknown API error code/
    );
    assert.throws(
      () => new ApiError("NON_EXISTENT_CODE"),
      /Unknown API error code/
    );
  });
});

test("ApiError class immutability requirements", async (t) => {
  await t.test("caller cannot override registered statusCode, message, or retryable", () => {
    const err = new ApiError("FLEET_NOT_FOUND", {
      statusCode: 500,
      message: "Internal DB failure text",
      retryable: true,
    });

    assert.equal(err.code, "FLEET_NOT_FOUND");
    assert.equal(err.statusCode, 404);
    assert.equal(err.message, "Fleet record not found.");
    assert.equal(err.retryable, false);

    assert.throws(() => { err.statusCode = 200; });
    assert.throws(() => { err.message = "hack"; });
  });

  await t.test("details sanitization strips stack, cause, password, token, and unapproved keys", () => {
    const err = new ApiError("READ_INVALID_FILTER", {
      details: {
        field: "status",
        stack: "Error at line 123",
        cause: "DB connection dropped",
        password: "secretpassword",
        token: "jwt_token_here",
      },
      cause: new Error("Underlying cause"),
    });

    assert.deepEqual(err.details, { field: "status" });
    assert.equal(err.cause.message, "Underlying cause");
    assert.equal(err.details.stack, undefined);
    assert.equal(err.details.cause, undefined);
    assert.equal(err.details.password, undefined);
    assert.equal(err.details.token, undefined);
  });
});
