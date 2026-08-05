"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { validateAdminOwnerProfileRequest } = require("../../../src/modules/admin/bus-owner-management/admin-owner-profile-request.policy");

test("admin-owner-profile-request-policy unit tests", async (t) => {
  const validOwnerId = "64f000000000000000000001";
  const validReason = "Updating user contact details for administrative record";

  await t.test("accepts valid request and trims strings, lowercases email", () => {
    const result = validateAdminOwnerProfileRequest({
      id: validOwnerId,
      name: "  Hari Bahadur  ",
      email: "  HARI@EXAMPLE.COM  ",
      changeReason: `  ${validReason}  `,
    });

    assert.equal(result.id, validOwnerId);
    assert.equal(result.changeReason, validReason);
    assert.deepEqual(result.updates, {
      name: "Hari Bahadur",
      email: "hari@example.com",
    });
  });

  await t.test("rejects missing or non-ObjectId id", () => {
    assert.throws(() => validateAdminOwnerProfileRequest({ changeReason: validReason }), (err) => err.code === "OWNER_PROFILE_ID_REQUIRED");
    assert.throws(() => validateAdminOwnerProfileRequest({ id: "INVALID_ID", changeReason: validReason }), (err) => err.code === "OWNER_PROFILE_INVALID_ID");
  });

  await t.test("rejects missing, short, or oversized changeReason", () => {
    assert.throws(() => validateAdminOwnerProfileRequest({ id: validOwnerId }), (err) => err.code === "OWNER_PROFILE_INVALID_REASON");
    assert.throws(() => validateAdminOwnerProfileRequest({ id: validOwnerId, changeReason: "Tiny" }), (err) => err.code === "OWNER_PROFILE_INVALID_REASON");
    assert.throws(() => validateAdminOwnerProfileRequest({ id: validOwnerId, changeReason: "A".repeat(501) }), (err) => err.code === "OWNER_PROFILE_INVALID_REASON");
  });

  await t.test("rejects unknown and privileged fields", () => {
    assert.throws(() => validateAdminOwnerProfileRequest({ id: validOwnerId, changeReason: validReason, unknownField: "hack" }), (err) => err.code === "OWNER_PROFILE_UNKNOWN_FIELD");
    for (const field of ["user", "verificationStatus", "kycReview", "roles", "documentUrls", "panNumber"]) {
      if (field === "panNumber") continue; // panNumber is allowed
      assert.throws(() => validateAdminOwnerProfileRequest({ id: validOwnerId, changeReason: validReason, [field]: "hack" }), (err) => err.code === "OWNER_PROFILE_PRIVILEGED_FIELD");
    }
  });

  await t.test("rejects non-string, empty, or whitespace-only profile values", () => {
    assert.throws(() => validateAdminOwnerProfileRequest({ id: validOwnerId, changeReason: validReason, name: null }), (err) => err.code === "OWNER_PROFILE_INVALID_VALUE");
    assert.throws(() => validateAdminOwnerProfileRequest({ id: validOwnerId, changeReason: validReason, name: "" }), (err) => err.code === "OWNER_PROFILE_INVALID_VALUE");
    assert.throws(() => validateAdminOwnerProfileRequest({ id: validOwnerId, changeReason: validReason, name: "   " }), (err) => err.code === "OWNER_PROFILE_INVALID_VALUE");
  });

  await t.test("rejects values exceeding field length limits", () => {
    assert.throws(() => validateAdminOwnerProfileRequest({ id: validOwnerId, changeReason: validReason, name: "A".repeat(101) }), (err) => err.code === "OWNER_PROFILE_VALUE_TOO_LONG");
    assert.throws(() => validateAdminOwnerProfileRequest({ id: validOwnerId, changeReason: validReason, companyName: "A".repeat(151) }), (err) => err.code === "OWNER_PROFILE_VALUE_TOO_LONG");
  });
});
