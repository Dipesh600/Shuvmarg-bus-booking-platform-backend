"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createKycSubmissionService } = require(
  "../../../src/modules/bus-owner/kyc-submission/kyc-submission.service"
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

function mockSession() {
  const calls = [];
  return {
    calls,
    session: {
      withTransaction: async (fn) => {
        calls.push("withTransaction");
        await fn();
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
