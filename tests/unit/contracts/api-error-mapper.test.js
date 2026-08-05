"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { ApiError, mapApiError } = require("../../../src/contracts");
const { ReadContractValidationError, ReadContractNotFoundError } = require("../../../src/modules/read-contracts/common/read-errors");
const { mapReadError } = require("../../../src/modules/read-contracts/common/read-error.mapper");

test("mapApiError canonical envelope formatting", async (t) => {
  await t.test("known ApiError maps to canonical envelope", () => {
    const err = new ApiError("FLEET_NOT_FOUND");
    const result = mapApiError(err);
    assert.equal(result.statusCode, 404);
    assert.deepEqual(result.payload, {
      success: false,
      error: {
        code: "FLEET_NOT_FOUND",
        message: "Fleet record not found.",
        details: null,
        retryable: false,
      },
    });
  });

  await t.test("arbitrary statusCode objects or raw errors map to INTERNAL_SERVER_ERROR 500 without leaking message", () => {
    let logged = null;
    const mockLogger = { error: (...args) => { logged = args; } };
    const rawErr = new Error("Sensitive DB connection query failed at SELECT * FROM users");
    rawErr.statusCode = 400;

    const result = mapApiError(rawErr, mockLogger);
    assert.equal(result.statusCode, 500);
    assert.deepEqual(result.payload, {
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Internal server error.",
        details: null,
        retryable: true,
      },
    });
    assert.ok(logged);
    assert.equal(result.payload.error.message.includes("Sensitive DB"), false);
  });
});

test("mapReadError deterministic Mongoose adaptation and domain error mapping", async (t) => {
  await t.test("CastError maps deterministically to READ_INVALID_ID (400)", () => {
    const castErr = new Error("Cast to ObjectId failed");
    castErr.name = "CastError";
    const result = mapReadError(castErr);
    assert.equal(result.statusCode, 400);
    assert.equal(result.payload.error.code, "READ_INVALID_ID");
  });

  await t.test("ValidationError maps deterministically to READ_INVALID_FILTER (400)", () => {
    const valErr = new Error("Validation failed");
    valErr.name = "ValidationError";
    const result = mapReadError(valErr);
    assert.equal(result.statusCode, 400);
    assert.equal(result.payload.error.code, "READ_INVALID_FILTER");
  });

  await t.test("ReadContractValidationError maps to READ_INVALID_FILTER", () => {
    const err = new ReadContractValidationError("READ_INVALID_FILTER", "Invalid query filter.");
    const result = mapReadError(err);
    assert.equal(result.statusCode, 400);
    assert.equal(result.payload.error.code, "READ_INVALID_FILTER");
  });

  await t.test("ReadContractNotFoundError maps to FLEET_NOT_FOUND", () => {
    const err = new ReadContractNotFoundError("FLEET_NOT_FOUND", "Fleet record not found.");
    const result = mapReadError(err);
    assert.equal(result.statusCode, 404);
    assert.equal(result.payload.error.code, "FLEET_NOT_FOUND");
  });
});
