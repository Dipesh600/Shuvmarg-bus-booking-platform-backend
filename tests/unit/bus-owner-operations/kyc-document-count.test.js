"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  countDocumentUrls,
  countInsuranceDocuments,
  countBusOwnerKycDocuments,
} = require("../../../src/modules/bus-owner/kyc-submission/kyc-document-count.js");

test("kyc-document-count unit tests", async (t) => {
  await t.test("missing or invalid owner returns 0", () => {
    assert.equal(countBusOwnerKycDocuments(null), 0);
    assert.equal(countBusOwnerKycDocuments(undefined), 0);
    assert.equal(countBusOwnerKycDocuments("invalid"), 0);
    assert.equal(countBusOwnerKycDocuments(123), 0);
    assert.equal(countBusOwnerKycDocuments({}), 0);
  });

  await t.test("countDocumentUrls filters non-empty strings only", () => {
    assert.equal(countDocumentUrls(null), 0);
    assert.equal(countDocumentUrls({}), 0);
    assert.equal(
      countDocumentUrls({
        documentUrls: [
          "https://legacy.com/a.pdf",
          "https://s3.amazonaws.com/b.pdf?presigned=1",
          "owners/1/kyc/company-registration/uuid.pdf",
          "",
          "   ",
          null,
          undefined,
          123,
          { url: "obj" },
        ],
      }),
      3
    );
  });

  await t.test("single section document URL counts 1 each", () => {
    assert.equal(countBusOwnerKycDocuments({ companyRegistration: { documentUrls: ["company.pdf"] } }), 1);
    assert.equal(countBusOwnerKycDocuments({ taxRegistration: { documentUrls: ["tax.pdf"] } }), 1);
    assert.equal(countBusOwnerKycDocuments({ transportLicense: { documentUrls: ["license.pdf"] } }), 1);
  });

  await t.test("insurance certificates count all valid document URLs", () => {
    assert.equal(countInsuranceDocuments(null), 0);
    assert.equal(countInsuranceDocuments([]), 0);
    assert.equal(
      countInsuranceDocuments([
        { documentUrls: ["ins1.pdf"] },
        { documentUrls: ["ins2.pdf", "ins3.pdf"] },
        { documentUrls: [null, "  "] },
      ]),
      3
    );
  });

  await t.test("excludes ownerIdentity and bankDetails from count", () => {
    const owner = {
      companyRegistration: { documentUrls: ["company.pdf"] },
      taxRegistration: { documentUrls: ["tax.pdf"] },
      transportLicense: { documentUrls: ["license.pdf"] },
      insuranceCertificates: [{ documentUrls: ["ins1.pdf", "ins2.pdf"] }],
      ownerIdentity: { documentUrls: ["should-not-count.pdf"] },
      bankDetails: { documentUrls: ["should-not-count.pdf"] },
    };
    assert.equal(countBusOwnerKycDocuments(owner), 5);
  });
});
