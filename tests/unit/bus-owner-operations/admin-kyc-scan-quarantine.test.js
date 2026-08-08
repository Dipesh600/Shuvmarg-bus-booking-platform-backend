"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { mapAdminKycDetail } = require("../../../src/modules/read-contracts/admin-kyc/admin-kyc-detail.dto");

test("admin KYC detail marks quarantined files unavailable in production", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    const quarantined = mapAdminKycDetail({
      _id: "64f000000000000000000001",
      user: { _id: "64f000000000000000000002" },
      verificationStatus: "pending",
      companyRegistration: { documentUrls: ["owners/1/kyc/company/doc.pdf"] },
      kycSecurity: { malwareScanStatus: "skipped_non_production" },
    });
    assert.equal(quarantined.documents.companyRegistration.present, true);
    assert.equal(quarantined.documents.companyRegistration.available, false);
    assert.deepEqual(quarantined.documentSecurity, {
      status: "skipped_non_production",
      scannedAt: null,
      availableToReview: false,
    });

    const clean = mapAdminKycDetail({
      _id: "64f000000000000000000001",
      user: { _id: "64f000000000000000000002" },
      verificationStatus: "pending",
      companyRegistration: { documentUrls: ["owners/1/kyc/company/doc.pdf"] },
      kycSecurity: {
        malwareScanStatus: "clean",
        scannedAt: new Date("2026-08-08T00:00:00.000Z"),
      },
      registeredAddress: {
        tole: "New Road",
        wardNumber: "4",
        municipality: "Kathmandu Metropolitan City",
        district: "Kathmandu",
        province: "Bagmati",
        postalCode: "44600",
        country: "Nepal",
      },
    });
    assert.equal(clean.documents.companyRegistration.available, true);
    assert.equal(clean.documentSecurity.availableToReview, true);
    assert.equal(clean.owner.registeredAddress.province, "Bagmati");
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});
