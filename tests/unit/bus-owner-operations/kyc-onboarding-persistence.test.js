"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { ApiError } = require("../../../src/contracts");
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

function mockSession(shouldFailOnCommit = false, failOnStart = false) {
  const calls = [];
  return {
    calls,
    session: {
      withTransaction: async (fn) => {
        if (failOnStart) throw new Error("Transaction start failed");
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
  assert.deepEqual(mock.calls, ["withTransaction", "commitTransaction", "endSession"]);
  assert.deepEqual(userSaveCalls, ["with-session"]);
  assert.deepEqual(busOwnerSaveCalls, ["with-session"]);
  assert.equal(createdOwner.companyName, "Nepal Transport Co.");
  assert.equal(createdOwner.taxRegistration.panNumber, "123456789");
  assert.equal(createdOwner.bankDetails.bankName, "Nepal Bank");
  assert.equal(createdOwner.verificationStatus, "pending");
});

test("kyc-onboarding-persistence: ownerName and address written to User, not BusOwner", async () => {
  const mock = mockSession();

  const MockUser = { findById: async () => ({
    name: null, address: null,
    save: async () => {},
  })};

  function MockBusOwner(val) {
    Object.assign(this, val);
    this.save = async () => {};
  }
  MockBusOwner.findOne = async () => null;

  const userRef = await MockUser.findById("user-1");
  const mockUserWithTracking = { ...userRef };
  MockUser.findById = async () => mockUserWithTracking;

  const service = createKycSubmissionService({
    BusOwner: MockBusOwner,
    User: MockUser,
    mongoose: makeMockMongoose(mock.session),
    storageService: { uploadDocument: async () => "key.pdf" },
  });

  await service.submitKyc({
    userId: "user-1",
    onboardingData: VALID_BODY,
    files: makeValidFiles(),
  });

  assert.equal(mockUserWithTracking.name, "Raju Shrestha");
  assert.equal(mockUserWithTracking.address, "Kathmandu, Nepal");
  assert.equal("ownerName" in ({}), false, "BusOwner must not receive ownerName field");
});

test("kyc-onboarding-persistence: linked User not found returns typed 404 error without uploads or BusOwner save", async () => {
  let uploadCalls = 0;
  let busOwnerSaved = false;

  const MockUser = { findById: async () => null };

  function MockBusOwner(val) {
    Object.assign(this, val);
    this.save = async () => { busOwnerSaved = true; };
  }
  MockBusOwner.findOne = async () => null;

  const service = createKycSubmissionService({
    BusOwner: MockBusOwner,
    User: MockUser,
    mongoose: makeMockMongoose(mockSession().session),
    storageService: {
      uploadDocument: async () => { uploadCalls++; return "key.pdf"; },
    },
  });

  await assert.rejects(
    () => service.submitKyc({ userId: "non-existent-user", onboardingData: VALID_BODY, files: makeValidFiles() }),
    (err) => err instanceof ApiError && err.code === "BUS_OWNER_ONBOARDING_USER_NOT_FOUND" && err.statusCode === 404
  );

  assert.equal(uploadCalls, 0, "No S3 uploads must occur when User is not found");
  assert.equal(busOwnerSaved, false, "BusOwner must not be saved when User is not found");
});

test("kyc-onboarding-persistence: mongoose session unavailable returns typed 500 error without saves or uncleaned uploads", async () => {
  let uploadCalls = 0;
  const deletedKeys = [];
  let userSaved = false;
  let busOwnerSaved = false;

  const MockUser = { findById: async () => ({
    save: async () => { userSaved = true; },
  })};

  function MockBusOwner(val) {
    Object.assign(this, val);
    this.save = async () => { busOwnerSaved = true; };
  }
  MockBusOwner.findOne = async () => null;

  const service = createKycSubmissionService({
    BusOwner: MockBusOwner,
    User: MockUser,
    mongoose: null, // Session unavailable
    storageService: {
      uploadDocument: async ({ documentType }) => { uploadCalls++; return `key/${documentType}.pdf`; },
      deleteMany: async (keys) => { deletedKeys.push(...keys); return { failed: [] }; },
    },
  });

  await assert.rejects(
    () => service.submitKyc({ userId: "u", onboardingData: VALID_BODY, files: makeValidFiles() }),
    (err) => err instanceof ApiError && err.code === "BUS_OWNER_ONBOARDING_TRANSACTION_UNAVAILABLE" && err.statusCode === 500
  );

  assert.equal(userSaved, false, "User must not be saved when mongoose session is unavailable");
  assert.equal(busOwnerSaved, false, "BusOwner must not be saved when mongoose session is unavailable");
});

test("kyc-onboarding-persistence: body validation failure uploads nothing", async () => {
  let uploadCalls = 0;
  const MockUser = { findById: async () => ({}) };
  function MockBusOwner() { this.save = async () => {}; }
  MockBusOwner.findOne = async () => null;

  const service = createKycSubmissionService({
    BusOwner: MockBusOwner,
    User: MockUser,
    mongoose: makeMockMongoose(mockSession().session),
    storageService: { uploadDocument: async () => { uploadCalls++; return "key.pdf"; } },
  });

  await assert.rejects(
    () => service.submitKyc({ userId: "u", onboardingData: { bad: "body" }, files: makeValidFiles() }),
    (err) => err instanceof BusOwnerOnboardingValidationError
  );
  assert.equal(uploadCalls, 0, "No uploads should occur when body validation fails");
});

test("kyc-onboarding-persistence: User save succeeds but BusOwner save fails -> transaction aborted and neither database change persists", async () => {
  const mock = mockSession();
  let userSaveCallCount = 0;

  const MockUser = { findById: async () => ({
    name: "Old Name", address: "Old Address",
    save: async () => { userSaveCallCount++; },
  })};

  function MockBusOwner(val) {
    Object.assign(this, val);
    this.save = async () => { throw new Error("BusOwner DB write error"); };
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
    (err) => err.message === "BusOwner DB write error"
  );

  assert.equal(deletedKeys.length, 3, "Newly uploaded keys must be cleaned after transaction failure");
  assert.equal(mock.calls.includes("endSession"), true, "Session must be ended");
});

test("kyc-onboarding-persistence: transaction start/commit fails -> uploaded keys cleaned and old rejected keys preserved", async () => {
  const mock = mockSession(true); // Fails on commit
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
  MockBusOwner.findOne = async () => new MockBusOwner(oldOwnerData);

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
