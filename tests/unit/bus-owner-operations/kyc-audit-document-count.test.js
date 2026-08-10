"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { countValidatedKycFiles } = require("../../../src/modules/bus-owner/kyc-audit");

test("kyc-audit-document-count unit tests", async (t) => {
  await t.test("counts validated files across known fields", async () => {
    const files = {
      companyRegistration: [{ path: "a" }],
      taxRegistration: [{ path: "b" }],
      ownerIdentity: [{ path: "c" }],
    };
    assert.equal(countValidatedKycFiles(files), 3);
  });

  await t.test("unknown properties are not counted", async () => {
    const files = {
      companyRegistration: [{ path: "a" }],
      unknownField: [{ path: "x" }, { path: "y" }],
      hacked: "evil",
    };
    assert.equal(countValidatedKycFiles(files), 1);
  });

  await t.test("handles empty or null files object", async () => {
    assert.equal(countValidatedKycFiles(null), 0);
    assert.equal(countValidatedKycFiles({}), 0);
  });
});
