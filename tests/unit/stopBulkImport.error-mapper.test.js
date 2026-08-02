const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { mapBulkWriteError } = require("../../src/modules/admin/platform-registry/stop-bulk-import/bulk-error-mapper");

describe("bulk-error-mapper unit tests", () => {
  it("should classify code conflict correctly", () => {
    const err = { code: 11000, keyPattern: { code: 1 }, errmsg: "E11000 dup key code_1" };
    const entry = { _sourceIndex: 5, code: "KTM", name: "Kathmandu" };
    const result = mapBulkWriteError(err, entry);

    assert.equal(result.errorCode, "STOP_CODE_CONFLICT");
    assert.equal(result.message, "A stop with this code already exists.");
    assert.equal(result.index, 5);
    assert.equal(result.code, "KTM");
  });

  it("should classify identity conflict correctly", () => {
    const err = { code: 11000, keyPattern: { _normalizedIdentity: 1 } };
    const entry = { _sourceIndex: 2, code: "PKR", name: "Pokhara" };
    const result = mapBulkWriteError(err, entry);

    assert.equal(result.errorCode, "STOP_IDENTITY_CONFLICT");
    assert.equal(result.message, "A stop with the same geographic identity already exists.");
    assert.equal(result.index, 2);
  });

  it("should classify unknown duplicate key error as DUPLICATE_STOP", () => {
    const err = { code: 11000 };
    const entry = { _sourceIndex: 1, code: "HTD", name: "Hetauda" };
    const result = mapBulkWriteError(err, entry);

    assert.equal(result.errorCode, "DUPLICATE_STOP");
    assert.equal(result.message, "The stop conflicts with an existing registry record.");
  });

  it("should classify generic write error as BULK_WRITE_ERROR", () => {
    const err = { code: 121, message: "Document failed validation" };
    const entry = { _sourceIndex: 0, code: "BRT", name: "Biratnagar" };
    const result = mapBulkWriteError(err, entry);

    assert.equal(result.errorCode, "BULK_WRITE_ERROR");
    assert.equal(result.message, "The stop could not be imported.");
  });
});
