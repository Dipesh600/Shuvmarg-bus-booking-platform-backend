"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createKycSubmissionService } = require("../../../src/modules/bus-owner/kyc-submission/kyc-submission.service");

const VALID_BODY = {
  companyName: "Nepal Transport Co.", ownerName: "Raju Shrestha",
  address: "Kathmandu, Nepal", panNumber: "123456789", registrationNumber: "REG-001",
  bankName: "Nepal Bank", accountHolderName: "Raju Shrestha",
  accountNumber: "12345678901234", branchName: "Newroad Branch",
};
const PDF_BUFFER = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n");

test("rejected owner replaces only rejected documents and retains approved files", async () => {
  const MockUser = { findById: async () => ({ name: "Owner", save: async () => {} }) };
  let savedOwner;
  const deletedKeys = [];
  const oldOwnerData = {
    verificationStatus: "rejected",
    companyRegistration: { documentUrls: ["company-approved.pdf"], verified: true, rejectionReason: null },
    taxRegistration: { documentUrls: ["tax-rejected.pdf"], verified: false, rejectionReason: "PAN is unreadable" },
    transportLicense: { documentUrls: ["license-approved.pdf"], verified: true, rejectionReason: null },
    bankDetails: {}, kycAuditHistory: [],
  };
  function MockBusOwner(value) {
    Object.assign(this, value);
    this.save = async () => { savedOwner = this; };
  }
  MockBusOwner.findOne = async () => new MockBusOwner(oldOwnerData);
  const session = { withTransaction: async (fn) => fn(), endSession: async () => {} };
  const service = createKycSubmissionService({
    BusOwner: MockBusOwner, User: MockUser,
    mongoose: { startSession: async () => session },
    storageService: {
      uploadDocument: async ({ documentType }) => `new-key/${documentType}.pdf`,
      deleteMany: async (keys) => { deletedKeys.push(...keys); return { failed: [] }; },
    },
  });
  const file = {
    fieldname: "taxRegistration", originalname: "taxRegistration.pdf",
    buffer: PDF_BUFFER, mimetype: "application/pdf",
  };
  await service.submitKyc({ userId: "u", onboardingData: VALID_BODY, files: { taxRegistration: [file] } });
  assert.deepEqual(savedOwner.companyRegistration.documentUrls, ["company-approved.pdf"]);
  assert.deepEqual(savedOwner.transportLicense.documentUrls, ["license-approved.pdf"]);
  assert.deepEqual(savedOwner.taxRegistration.documentUrls, ["new-key/taxRegistration.pdf"]);
  assert.deepEqual(deletedKeys, ["tax-rejected.pdf"]);
  assert.equal(savedOwner.verificationStatus, "pending");
});
