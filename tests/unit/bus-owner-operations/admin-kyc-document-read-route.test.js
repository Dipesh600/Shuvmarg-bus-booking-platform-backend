"use strict";

// Spec items 1, 2, 8:
//   [ ] Admin document-read route is registered
//   [ ] Route uses adminMiddleware
//   [ ] Admin detail response continues to contain no raw keys

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { sanitizeKycDetailDescriptors } = require("../../../src/modules/bus-owner/kyc-document-read/kyc-document-read.controller");

const ROOT = path.resolve(__dirname, "../../..");
const ADMIN_ROUTES = path.join(ROOT, "routes/adminRoutes/adminRoutes.js");

test("admin document-read route registration and middleware", async (t) => {
  const src = fs.readFileSync(ADMIN_ROUTES, "utf8");

  await t.test("route is registered at GET /busOwner/kycDocumentReadUrl", () => {
    assert.match(src, /\/busOwner\/kycDocumentReadUrl/);
    assert.match(src, /kycDocumentRead\.getKycDocumentReadUrl/);
  });

  await t.test("route guard is adminMiddleware (appears as second argument)", () => {
    assert.match(
      src,
      /router\.get\(["']\/busOwner\/kycDocumentReadUrl["'],\s*adminMiddleware,/
    );
  });

  await t.test("handler is required from src/modules/bus-owner/kyc-document-read", () => {
    assert.match(src, /src\/modules\/bus-owner\/kyc-document-read/);
  });
});

test("admin detail response contains no raw document keys (spec item 8)", () => {
  const rawFromDb = {
    verificationStatus: "approved",
    companyRegistration: {
      status: "uploaded",
      documentUrls: ["owners/1/kyc/reg.pdf"],
      documentReferences: [{ storageReference: "owners/1/kyc/reg.pdf" }],
    },
    taxRegistration: { documentUrls: ["owners/1/kyc/tax.pdf"] },
    ownerIdentity:   { documentUrls: ["owners/1/kyc/id.pdf"] },
    transportLicense: { documentUrls: [] },
    insuranceCertificates: [{ documentUrls: ["owners/1/kyc/ins.pdf"] }],
  };

  const out = sanitizeKycDetailDescriptors(rawFromDb);

  for (const field of ["companyRegistration", "taxRegistration", "ownerIdentity"]) {
    assert.equal(out[field].documentUrls, undefined,    `${field}.documentUrls must be absent`);
    assert.equal(out[field].documentReferences, undefined, `${field}.documentReferences must be absent`);
  }
  assert.equal(out.insuranceCertificates[0].documentUrls, undefined);
  assert.equal(out.companyRegistration.fileCount, 1);
  assert.equal(out.transportLicense.available, false);
  assert.equal(out.verificationStatus, "approved");
});
