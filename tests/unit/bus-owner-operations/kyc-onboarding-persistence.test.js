"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createKycSubmissionService } = require(
  "../../../src/modules/bus-owner/kyc-submission/kyc-submission.service"
);
const { BusOwnerOnboardingValidationError } = require(
  "../../../src/modules/bus-owner/kyc-submission/kyc-submission.errors"
);

const PDF_BUFFER = Buffer.concat([Buffer.from("%PDF-1.4\n%"), Buffer.alloc(100)]);
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

function mockSession(shouldFail = false) {
  const calls = [];
  return {
    calls,
    session: {
      startTransaction: () => calls.push("startTransaction"),
      commitTransaction: async () => {
        if (shouldFail) throw new Error("Commit failed");
        calls.push("commitTransaction");
      },
      abortTransaction: async () => calls.push("abortTransaction"),
      endSession: () => calls.push("endSession"),
    },
  };
}

function makeMockMongoose(session) {
  return { startSession: async () => session };
}

test("kyc-onboarding-persistence: new owner saves User and BusOwner inside transaction", async () => {
  const userSaveCalls = [];
  const busOwnerSaveCalls = [];
  const mock = mockSession();

  const MockUser = { findById: async () => ({
    name: null, address: null,
    save: async (opts) => { userSaveCalls.push(opts?.session ? "with-session" : "no-session"); },
  })};

  let createdOwner;
  function MockBusOwner(val) {
    createdOwner = Object.assign(this, val);
    this.save = async (opts) => {
      busOwnerSaveCalls.push(opts?.session ? "with-session" : "no-session");
    };
  }
  MockBusOwner.findOne = async () => null;

  const service = createKycSubmissionService({
    BusOwner: MockBusOwner,
    User: MockUser,
    mongoose: makeMockMongoose(mock.session),
    storageService: {
      uploadDocument: async ({ documentType }) => `key/${documentType}.pdf`,
    },
  });

  const res = await service.submitKyc({
    userId: "user-1",
    onboardingData: VALID_BODY,
    files: makeValidFiles(),
  });

  assert.equal(res.success, true);
  assert.deepEqual(res.data, { verificationStatus: "pending" });
  assert.deepEqual(mock.calls, ["startTransaction", "commitTransaction", "endSession"]);
  assert.deepEqual(userSaveCalls, ["with-session"]);
  assert.deepEqual(busOwnerSaveCalls, ["with-session"]);
  assert.equal(createdOwner.companyName, "Nepal Transport Co.");
  assert.equal(createdOwner.taxRegistration.panNumber, "123456789");
  assert.equal(createdOwner.bankDetails.bankName, "Nepal Bank");
  assert.equal(createdOwner.verificationStatus, "pending");
});

test("kyc-onboarding-persistence: ownerName and address written to User, not BusOwner", async () => {
  let savedUser;
  const mock = mockSession();

  const MockUser = { findById: async () => ({
    name: null, address: null,
    save: async () => { savedUser = this; },
  })};

  function MockBusOwner(val) {
    Object.assign(this, val);
    this.save = async () => {};
  }
  MockBusOwner.findOne = async () => null;

  const service = createKycSubmissionService({
    BusOwner: MockBusOwner,
    User: MockUser,
    mongoose: makeMockMongoose(mock.session),
    storageService: { uploadDocument: async () => "key.pdf" },
  });

  const userRef = await MockUser.findById("user-1");
  const mockUserWithTracking = { ...userRef };
  MockUser.findById = async () => mockUserWithTracking;

  await service.submitKyc({
    userId: "user-1",
    onboardingData: VALID_BODY,
    files: makeValidFiles(),
  });

  assert.equal(mockUserWithTracking.name, "Raju Shrestha");
  assert.equal(mockUserWithTracking.address, "Kathmandu, Nepal");
  assert.equal("ownerName" in ({}), false, "BusOwner must not receive ownerName field");
});

test("kyc-onboarding-persistence: body validation failure uploads nothing", async () => {
  let uploadCalls = 0;
  const MockUser = { findById: async () => ({}) };
  function MockBusOwner() { this.save = async () => {}; }
  MockBusOwner.findOne = async () => null;

  const service = createKycSubmissionService({
    BusOwner: MockBusOwner,
    User: MockUser,
    mongoose: { startSession: async () => ({}) },
    storageService: { uploadDocument: async () => { uploadCalls++; return "key.pdf"; } },
  });

  await assert.rejects(
    () => service.submitKyc({ userId: "u", onboardingData: { bad: "body" }, files: makeValidFiles() }),
    (err) => err instanceof BusOwnerOnboardingValidationError
  );
  assert.equal(uploadCalls, 0, "No uploads should occur when body validation fails");
});

test("kyc-onboarding-persistence: transaction abort on User save failure leaves BusOwner unchanged", async () => {
  const mock = mockSession();
  const originalUserName = "Old Name";

  const MockUser = { findById: async () => ({
    name: originalUserName, address: "old",
    save: async () => { throw new Error("User write failed"); },
  })};

  let busOwnerSaved = false;
  function MockBusOwner(val) {
    Object.assign(this, val);
    this.save = async () => { busOwnerSaved = true; };
  }
  MockBusOwner.findOne = async () => null;

  const deletedKeys = [];
  const service = createKycSubmissionService({
    BusOwner: MockBusOwner,
    User: MockUser,
    mongoose: makeMockMongoose(mock.session),
    storageService: {
      uploadDocument: async ({ documentType }) => `key/${documentType}.pdf`,
      deleteMany: async (keys) => { deletedKeys.push(...keys); return { failed: [] }; },
    },
  });

  await assert.rejects(
    () => service.submitKyc({ userId: "u", onboardingData: VALID_BODY, files: makeValidFiles() }),
    (err) => err.message === "User write failed"
  );

  assert.equal(mock.calls.includes("abortTransaction"), true, "Transaction must be aborted");
  assert.equal(busOwnerSaved, false, "BusOwner.save must not succeed when transaction aborts");
  assert.equal(deletedKeys.length, 3, "Newly uploaded keys must be cleaned after transaction failure");
});

test("kyc-onboarding-persistence: transaction abort on BusOwner save failure cleans new uploads", async () => {
  const mock = mockSession();
  const MockUser = { findById: async () => ({
    name: null, address: null,
    save: async () => {},
  })};

  let uploadCount = 0;
  const deletedKeys = [];

  function MockBusOwner(val) {
    Object.assign(this, val);
    this.save = async () => { throw new Error("BusOwner write failed"); };
  }
  MockBusOwner.findOne = async () => null;

  const service = createKycSubmissionService({
    BusOwner: MockBusOwner,
    User: MockUser,
    mongoose: makeMockMongoose(mock.session),
    storageService: {
      uploadDocument: async ({ documentType }) => {
        uploadCount++;
        return `key/${documentType}.pdf`;
      },
      deleteMany: async (keys) => { deletedKeys.push(...keys); return { failed: [] }; },
    },
  });

  await assert.rejects(
    () => service.submitKyc({ userId: "u", onboardingData: VALID_BODY, files: makeValidFiles() }),
    (err) => err.message === "BusOwner write failed"
  );

  assert.equal(mock.calls.includes("abortTransaction"), true);
  assert.equal(uploadCount, 3);
  assert.equal(deletedKeys.length, 3, "All newly uploaded keys cleaned on BusOwner save failure");
});

test("kyc-onboarding-persistence: approved owner cannot resubmit", async () => {
  function MockBusOwner(val) { Object.assign(this, val); }
  MockBusOwner.findOne = async () => new MockBusOwner({ verificationStatus: "approved" });

  const service = createKycSubmissionService({
    BusOwner: MockBusOwner, User: {}, mongoose: {}, storageService: {},
  });
  await assert.rejects(
    () => service.submitKyc({ userId: "u", onboardingData: VALID_BODY, files: makeValidFiles() }),
    (err) => err.code === "KYC_SUBMISSION_STATE_CONFLICT" && err.statusCode === 409
  );
});

test("kyc-onboarding-persistence: pending owner cannot resubmit", async () => {
  function MockBusOwner(val) { Object.assign(this, val); }
  MockBusOwner.findOne = async () => new MockBusOwner({ verificationStatus: "pending" });

  const service = createKycSubmissionService({
    BusOwner: MockBusOwner, User: {}, mongoose: {}, storageService: {},
  });
  await assert.rejects(
    () => service.submitKyc({ userId: "u", onboardingData: VALID_BODY, files: makeValidFiles() }),
    (err) => err.code === "KYC_SUBMISSION_STATE_CONFLICT" && err.statusCode === 409
  );
});

test("kyc-onboarding-persistence: rejected owner data replaced on resubmission", async () => {
  const mock = mockSession();
  const MockUser = { findById: async () => ({
    name: "Old Name", address: "Old Address",
    save: async () => {},
  })};

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
  assert.equal(savedOwner.bankDetails.bankName, "Nepal Bank");
  assert.equal(savedOwner.verificationStatus, "pending");
});

test("kyc-onboarding-persistence: old rejected documents preserved when transaction fails", async () => {
  const mock = mockSession(true); // commit will fail
  const MockUser = { findById: async () => ({
    name: null, address: null,
    save: async () => {},
  })};

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
  assert.equal(mock.calls.includes("abortTransaction"), true);
});

test("kyc-onboarding-persistence: unexpected error returns as-is (no message classification)", async () => {
  const MockUser = { findById: async () => { throw new Error("validation failed because database connection disappeared"); } };
  function MockBusOwner() {}
  MockBusOwner.findOne = async () => null;

  const service = createKycSubmissionService({
    BusOwner: MockBusOwner, User: MockUser, mongoose: {}, storageService: {},
  });

  const err = await service.submitKyc({
    userId: "u", onboardingData: VALID_BODY, files: makeValidFiles(),
  }).then(() => null).catch((e) => e);

  assert.notEqual(err, null);
  assert.notEqual(err instanceof BusOwnerOnboardingValidationError, true,
    "Error with 'validation' in message must NOT be reclassified as onboarding validation error");
  assert.equal(err.message, "validation failed because database connection disappeared");
});
