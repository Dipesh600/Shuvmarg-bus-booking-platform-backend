"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  ADMIN_KYC_FILE_MAPPING,
  normalizeAdminKycFiles,
} = require("../../../src/modules/admin/bus-owner-management/admin-kyc-document-mapping.policy");

test("admin-kyc-document-mapping unit tests", async (t) => {
  await t.test("maps valid admin form file names to canonical domain document sections", async () => {
    const fakeCompany = { name: "company.pdf" };
    const fakeTax = { name: "tax.pdf" };
    const fakeIdentity = { name: "id.pdf" };
    const fakeBank = { name: "bank.pdf" };

    const rawFiles = {
      companyRegistrationCert: fakeCompany,
      panCardImage: fakeTax,
      ownerCitizenship: fakeIdentity,
      bankAuthorizationLetter: fakeBank,
    };

    const normalized = normalizeAdminKycFiles(rawFiles);
    assert.equal(normalized.companyRegistration, fakeCompany);
    assert.equal(normalized.taxRegistration, fakeTax);
    assert.equal(normalized.ownerIdentity, fakeIdentity);
    assert.equal(normalized.bankDetails, fakeBank);
  });

  await t.test("rejects unknown upload file fields", async () => {
    const rawFiles = {
      companyRegistrationCert: { name: "company.pdf" },
      unknownHackField: { name: "evil.exe" },
    };

    assert.throws(
      () => normalizeAdminKycFiles(rawFiles),
      (err) => err.code === "KYC_UNKNOWN_DOCUMENT_FIELD" && err.field === "unknownHackField"
    );
  });

  await t.test("handles null, empty or missing files object safely", async () => {
    assert.deepEqual(normalizeAdminKycFiles(null), {});
    assert.deepEqual(normalizeAdminKycFiles(undefined), {});
    assert.deepEqual(normalizeAdminKycFiles({}), {});
  });
});
