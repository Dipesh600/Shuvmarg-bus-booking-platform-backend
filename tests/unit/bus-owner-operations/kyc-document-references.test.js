"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { collectBusOwnerKycStorageReferences } = require("../../../src/modules/bus-owner/kyc-submission/kyc-document-references.js");

test("kyc-document-references unit tests", async (t) => {
  await t.test("missing or invalid owner returns empty array", () => {
    assert.deepEqual(collectBusOwnerKycStorageReferences(null), []);
    assert.deepEqual(collectBusOwnerKycStorageReferences(undefined), []);
    assert.deepEqual(collectBusOwnerKycStorageReferences("invalid"), []);
    assert.deepEqual(collectBusOwnerKycStorageReferences(123), []);
    assert.deepEqual(collectBusOwnerKycStorageReferences({}), []);
  });

  await t.test("collects active sections, flattens insurance, excludes invalid, removes duplicates, preserves legacy URLs", () => {
    const owner = {
      companyRegistration: { documentUrls: ["owners/1/c.pdf", "https://cloudinary.com/old.pdf", "owners/1/c.pdf", "  ", null] },
      taxRegistration: { documentUrls: ["owners/1/t.pdf"] },
      transportLicense: { documentUrls: ["owners/1/l.pdf"] },
      insuranceCertificates: [
        { documentUrls: ["owners/1/i1.pdf", "owners/1/t.pdf"] },
        { documentUrls: ["owners/1/i2.pdf", 123, ""] },
      ],
      ownerIdentity: { documentUrls: ["owners/1/must-not-collect-identity.pdf"] },
      bankDetails: { documentUrls: ["owners/1/must-not-collect-bank.pdf"] },
    };

    const originalJson = JSON.stringify(owner);
    const result = collectBusOwnerKycStorageReferences(owner);

    assert.deepEqual(result, [
      "owners/1/c.pdf",
      "https://cloudinary.com/old.pdf",
      "owners/1/t.pdf",
      "owners/1/l.pdf",
      "owners/1/i1.pdf",
      "owners/1/i2.pdf",
    ]);

    assert.equal(JSON.stringify(owner), originalJson, "Must not mutate input");
  });
});
