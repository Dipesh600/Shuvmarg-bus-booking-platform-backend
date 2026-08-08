"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createKycSubmissionService } = require(
  "../../../src/modules/bus-owner/kyc-submission/kyc-submission.service"
);

const PDF_BUFFER = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n");
function makeFile(name) {
  return { fieldname: name, originalname: `${name}.pdf`, buffer: PDF_BUFFER, mimetype: "application/pdf" };
}
function makeValidFiles() {
  return {
    companyRegistration: [makeFile("companyRegistration")],
    taxRegistration: [makeFile("taxRegistration")],
    transportLicense: [makeFile("transportLicense")],
  };
}

const VALID_BODY = {
  companyName: "Nepal Transport Co.",
  ownerName: "Raju Shrestha",
  address: "Kathmandu, Nepal",
  panNumber: "123456789",
  registrationNumber: "REG-001",
  bankName: "Nepal Bank",
  accountHolderName: "Raju Shrestha",
  accountNumber: "12345678901234",
  branchName: "Newroad Branch",
};

function mockSession(shouldFailOnCommit = false) {
  const calls = [];
  return {
    calls,
    session: {
      withTransaction: async (fn) => {
        calls.push("withTransaction");
        await fn();
        if (shouldFailOnCommit) throw new Error("Commit failed");
        calls.push("commitTransaction");
      },
      endSession: async () => calls.push("endSession"),
    },
  };
}

function makeMockMongoose(session) {
  return { startSession: async () => session };
}

test("kyc-onboarding-persistence: transaction start/commit fails -> uploaded keys cleaned and old rejected keys preserved", async () => {
  const mock = mockSession(true);
  const MockUser = { findById: async () => ({ name: null, address: null, save: async () => {} }) };

  const oldDocKey = "old-rejected-key.pdf";
  const oldOwnerData = {
    verificationStatus: "rejected",
    companyRegistration: { documentUrls: [oldDocKey] },
    taxRegistration: { documentUrls: [] },
    transportLicense: { documentUrls: [] },
    insuranceCertificates: [],
    kycAuditHistory: [],
  };

  function MockBusOwner(val) {
    Object.assign(this, val);
    this.save = async () => {};
  }
  MockBusOwner.findOne = async () => new MockBusOwner(oldDocKey ? oldOwnerData : {});

  const deletedKeys = [];
  const service = createKycSubmissionService({
    BusOwner: MockBusOwner,
    User: MockUser,
    mongoose: makeMockMongoose(mock.session),
    storageService: {
      uploadDocument: async ({ documentType }) => `new-key/${documentType}.pdf`,
      deleteMany: async (keys) => { deletedKeys.push(...keys); return { failed: [] }; },
    },
  });

  await assert.rejects(
    () => service.submitKyc({ userId: "u", onboardingData: VALID_BODY, files: makeValidFiles() }),
    (err) => err.message === "Commit failed"
  );

  assert.equal(
    deletedKeys.includes(oldDocKey), false,
    "Old rejected document must NOT be deleted when transaction fails"
  );
  assert.equal(deletedKeys.length, 3, "New uploaded documents MUST be deleted when transaction fails");
  assert.equal(mock.calls.includes("endSession"), true);
});

test("kyc-onboarding-persistence: rejected owner data replaced on resubmission", async () => {
  const mock = mockSession();
  const MockUser = { findById: async () => ({ name: "Old Name", address: "Old Address", save: async () => {} }) };

  let savedOwner;
  const oldOwnerData = {
    verificationStatus: "rejected",
    companyName: "Old Co",
    taxRegistration: { panNumber: "OLD" },
    bankDetails: { bankName: "Old Bank" },
    companyRegistration: { documentUrls: ["old-key.pdf"] },
    kycAuditHistory: [],
  };

  function MockBusOwner(val) {
    Object.assign(this, val);
    this.save = async () => { savedOwner = this; };
  }
  MockBusOwner.findOne = async () => new MockBusOwner(oldOwnerData);

  const service = createKycSubmissionService({
    BusOwner: MockBusOwner,
    User: MockUser,
    mongoose: makeMockMongoose(mock.session),
    storageService: {
      uploadDocument: async ({ documentType }) => `new-key/${documentType}.pdf`,
      deleteMany: async () => ({ failed: [] }),
    },
  });

  await service.submitKyc({ userId: "u", onboardingData: VALID_BODY, files: makeValidFiles() });

  assert.equal(savedOwner.companyName, "Nepal Transport Co.");
  assert.equal(savedOwner.taxRegistration.panNumber, "123456789");
  assert.equal(savedOwner.bankDetails.bankName, "Nepal Bank Ltd.");
  assert.equal(savedOwner.verificationStatus, "pending");
});
