"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createKycSubmissionService } = require(
  "../../../src/modules/bus-owner/kyc-submission/kyc-submission.service"
);
const { makeValidFiles } = require("./helpers/kyc-test-fixtures");

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
  MockBusOwner.findOne = async () => new MockBusOwner({
    verificationStatus: "pending",
    companyRegistration: { documentUrls: ["company.pdf"] },
    taxRegistration: { documentUrls: ["tax.pdf"] },
    ownerIdentity: { documentUrls: ["identity.pdf"] },
  });

  const service = createKycSubmissionService({
    BusOwner: MockBusOwner, User: {}, mongoose: {}, storageService: {},
  });
  await assert.rejects(
    () => service.submitKyc({ userId: "u", onboardingData: VALID_BODY, files: makeValidFiles() }),
    (err) => err.code === "KYC_SUBMISSION_STATE_CONFLICT" && err.statusCode === 409
  );
});
