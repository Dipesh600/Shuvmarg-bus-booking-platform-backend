"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  hasStoredDocument,
  collectInvalidKycDocumentTypes,
  sanitizeInvalidDocumentTypes,
} = require("../../../src/modules/bus-owner/kyc-audit");

test("kyc-audit-invalid-documents unit tests", async (t) => {
  await t.test("hasStoredDocument detects non-empty string URLs", async () => {
    assert.equal(hasStoredDocument(null), false);
    assert.equal(hasStoredDocument({}), false);
    assert.equal(hasStoredDocument({ documentUrls: [] }), false);
    assert.equal(hasStoredDocument({ documentUrls: ["", "  "] }), false);
    assert.equal(hasStoredDocument({ documentUrls: ["kyc-docs/key.pdf"] }), true);
  });

  await t.test("empty ownerIdentity with verified=false is NOT included", async () => {
    const owner = {
      ownerIdentity: { documentUrls: [], verified: false },
      companyRegistration: { documentUrls: ["c.pdf"], verified: false },
    };
    const invalid = collectInvalidKycDocumentTypes(owner);
    assert.deepEqual(invalid, ["companyRegistration"]);
  });

  await t.test("ownerIdentity with a stored document and verified=false IS included", async () => {
    const owner = {
      ownerIdentity: { documentUrls: ["id.pdf"], verified: false },
    };
    const invalid = collectInvalidKycDocumentTypes(owner);
    assert.deepEqual(invalid, ["ownerIdentity"]);
  });

  await t.test("empty optional insurance certificate with verified=false is NOT included", async () => {
    const owner = {
      insuranceCertificates: [{ documentUrls: [], verified: false }],
    };
    const invalid = collectInvalidKycDocumentTypes(owner);
    assert.deepEqual(invalid, []);
  });

  await t.test("insurance certificate with documentUrls and verified=false IS included", async () => {
    const owner = {
      insuranceCertificates: [{ documentUrls: ["ins.pdf"], verified: false }],
    };
    const invalid = collectInvalidKycDocumentTypes(owner);
    assert.deepEqual(invalid, ["insuranceCertificates"]);
  });

  await t.test("empty schema-default sections never enter audit metadata and canonical ordering remains deterministic", async () => {
    const owner = {
      transportLicense: { documentUrls: ["t.pdf"], verified: false },
      companyRegistration: { documentUrls: ["c.pdf"], verified: false },
      taxRegistration: { documentUrls: [], verified: false },
      ownerIdentity: { documentUrls: [], verified: false },
    };
    const invalid = collectInvalidKycDocumentTypes(owner);
    assert.deepEqual(invalid, ["companyRegistration", "transportLicense"]);
  });

  await t.test("sanitizeInvalidDocumentTypes filters unknown strings and deduplicates deterministically", async () => {
    const raw = ["taxRegistration", "unknownSection", "companyRegistration", "taxRegistration", "hack"];
    const sanitized = sanitizeInvalidDocumentTypes(raw);
    assert.deepEqual(sanitized, ["companyRegistration", "taxRegistration"]);
  });
});
