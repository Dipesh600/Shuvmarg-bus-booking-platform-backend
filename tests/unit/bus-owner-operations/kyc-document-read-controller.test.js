"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createKycDocumentReadController,
  sanitizeKycDetailDescriptors,
} = require("../../../src/modules/bus-owner/kyc-document-read/kyc-document-read.controller");

function createMockResponse() {
  const res = {
    statusCode: null,
    body: null,
    status(code) { res.statusCode = code; return res; },
    json(value) { res.body = value; return res; },
  };
  return res;
}

const mockOwner = {
  _id: "64f000000000000000000001",
  user: "64f000000000000000000002",
  companyRegistration: { documentUrls: ["owners/owner-1/kyc/secret.pdf"] },
  insuranceCertificates: [{ documentUrls: ["owners/owner-1/kyc/ins.pdf"] }],
};

function makeMockBusOwnerModel(owner = mockOwner) {
  return {
    findOne: async () => owner,
  };
}

test("kyc-document-read-controller unit tests", async (t) => {
  await t.test("sanitizeKycDetailDescriptors strips raw S3 keys from detail responses", () => {
    const sanitized = sanitizeKycDetailDescriptors(mockOwner);
    assert.equal(sanitized.companyRegistration.documentUrls, undefined);
    assert.equal(sanitized.companyRegistration.documentReferences, undefined);
    assert.equal(sanitized.companyRegistration.available, true);
    assert.equal(sanitized.companyRegistration.fileCount, 1);
    assert.equal(sanitized.insuranceCertificates[0].documentUrls, undefined);
  });

  await t.test("getKycDocumentReadUrl response contains no raw objectKey field", async () => {
    let presignCallCount = 0;
    const mockUrlService = {
      generateReadUrl: async () => {
        presignCallCount++;
        return { downloadUrl: "https://s3.amazonaws.com/presigned-url-token", expiresAt: "2026-08-04T12:05:00.000Z" };
      },
    };
    const controller = createKycDocumentReadController({ BusOwner: makeMockBusOwnerModel(), urlService: mockUrlService });

    const req = {
      userInfo: { id: "64f000000000000000000002" },
      query: { id: "64f000000000000000000001", documentType: "companyRegistration", fileIndex: 0 },
    };
    const res = createMockResponse();

    await controller.getKycDocumentReadUrl(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.downloadUrl, "https://s3.amazonaws.com/presigned-url-token");
    assert.equal(res.body.data.objectKey, undefined);
    assert.equal(presignCallCount, 1);
  });

  await t.test("Denied request produces zero presigning calls and returns 403", async () => {
    let presignCallCount = 0;
    const mockUrlService = { generateReadUrl: async () => { presignCallCount++; return {}; } };
    const controller = createKycDocumentReadController({ BusOwner: makeMockBusOwnerModel(), urlService: mockUrlService });

    const req = {
      userInfo: { id: "64f000000000000000000099" },
      query: { id: "64f000000000000000000001", documentType: "companyRegistration", fileIndex: 0 },
    };
    const res = createMockResponse();

    await controller.getKycDocumentReadUrl(req, res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.success, false);
    assert.equal(presignCallCount, 0);
  });

  await t.test("Non-integer fileIndex returns 400 and zero presigning calls", async () => {
    let presignCallCount = 0;
    const mockUrlService = { generateReadUrl: async () => { presignCallCount++; return {}; } };
    const controller = createKycDocumentReadController({ BusOwner: makeMockBusOwnerModel(), urlService: mockUrlService });

    const req = {
      userInfo: { id: "64f000000000000000000002" },
      query: { id: "64f000000000000000000001", documentType: "companyRegistration", fileIndex: "abc" },
    };
    const res = createMockResponse();

    await controller.getKycDocumentReadUrl(req, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.success, false);
    assert.equal(presignCallCount, 0);
  });

  await t.test("Owner status response strips documentUrls at response boundary", () => {
    const ownerWithUrls = {
      _id: "owner-1",
      user: "user-1",
      verificationStatus: "pending",
      companyRegistration: { status: "uploaded", documentUrls: ["owners/1/kyc/reg.pdf"] },
      insuranceCertificates: [{ documentUrls: ["owners/1/kyc/ins.pdf"] }],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const sanitized = sanitizeKycDetailDescriptors(ownerWithUrls);
    assert.equal(sanitized.companyRegistration.documentUrls, undefined, "No raw S3 keys in owner status response");
    assert.equal(sanitized.insuranceCertificates[0].documentUrls, undefined, "No raw S3 keys for insurance");
    assert.ok(typeof sanitized.companyRegistration.fileCount === "number");
  });

  await t.test("Admin detail response strips documentUrls and documentReferences", () => {
    const adminResolved = {
      _id: "owner-1",
      user: { name: "Test", email: "t@t.com" },
      verificationStatus: "approved",
      companyRegistration: {
        documentUrls: ["owners/1/kyc/reg.pdf"],
        documentReferences: [{ storageReference: "owners/1/kyc/reg.pdf", viewUrl: "https://...", legacy: false }],
      },
    };
    const sanitized = sanitizeKycDetailDescriptors(adminResolved);
    assert.equal(sanitized.companyRegistration.documentUrls, undefined, "No raw keys in admin response");
    assert.equal(sanitized.companyRegistration.documentReferences, undefined, "No references in admin response");
    assert.equal(sanitized.companyRegistration.fileCount, 1);
  });
});
