"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { sanitizeKycDetailDescriptors } = require("../../../src/modules/bus-owner/kyc-document-read/kyc-document-read.controller");
const { createKycSubmissionController } = require("../../../src/modules/bus-owner/kyc-submission/kyc-submission.controller");

test("kyc-audit-exposure unit tests", async (t) => {
  const mockOwnerWithHistory = {
    _id: "64f000000000000000000001",
    user: "64f000000000000000000002",
    verificationStatus: "pending",
    kycAuditHistory: [{ eventType: "KYC_SUBMITTED", actorType: "BUS_OWNER", actorId: "64f000000000000000000002" }],
  };

  await t.test("sanitizeKycDetailDescriptors removes kycAuditHistory from sanitized object", async () => {
    const sanitized = sanitizeKycDetailDescriptors(mockOwnerWithHistory);
    assert.equal(sanitized.kycAuditHistory, undefined, "kycAuditHistory must be deleted");
    assert.equal(mockOwnerWithHistory.kycAuditHistory.length, 1, "Original object must not be mutated");
  });

  await t.test("getMyBusOwnerKycStatus does not expose kycAuditHistory in response data", async () => {
    let jsonResponse = null;
    const res = {
      status: (code) => {
        assert.equal(code, 200);
        return { json: (data) => { jsonResponse = data; return data; } };
      },
    };
    const req = { userInfo: { id: "64f000000000000000000002" } };
    const MockBusOwner = { findOne: () => ({ lean: async () => mockOwnerWithHistory }) };

    const controller = createKycSubmissionController({ BusOwner: MockBusOwner, storageService: {} });
    await controller.getMyBusOwnerKycStatus(req, res);

    assert.ok(jsonResponse && jsonResponse.data, "Must return data object");
    assert.equal(jsonResponse.data.kycAuditHistory, undefined, "kycAuditHistory must not be exposed to bus owner");
  });
});
