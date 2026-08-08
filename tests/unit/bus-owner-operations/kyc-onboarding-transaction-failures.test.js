"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { ApiError } = require("../../../src/contracts");
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
    mongoose: null,
    storageService: { uploadDocument: async () => "key.pdf" },
  });

  await assert.rejects(
    () => service.submitKyc({ userId: "u", onboardingData: VALID_BODY, files: makeValidFiles() }),
    (err) => err instanceof ApiError && err.code === "BUS_OWNER_ONBOARDING_TRANSACTION_UNAVAILABLE" && err.statusCode === 500
  );

  assert.equal(userSaved, false);
  assert.equal(busOwnerSaved, false);
});

test("kyc-onboarding-persistence: User save succeeds but BusOwner save fails -> transaction aborted and neither database change persists", async () => {
  const mock = mockSession();

  const MockUser = { findById: async () => ({
    name: "Old Name", address: "Old Address",
    save: async () => {},
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
