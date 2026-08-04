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
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(value) {
      res.body = value;
      return res;
    },
  };
  return res;
}

test("kyc-document-read-controller unit tests", async (t) => {
  const mockOwner = {
    _id: "64f000000000000000000001",
    user: "64f000000000000000000002",
    companyRegistration: { documentUrls: ["owners/owner-1/kyc/secret.pdf"] },
    insuranceCertificates: [{ documentUrls: ["owners/owner-1/kyc/ins.pdf"] }],
  };

  const mockBusOwnerModel = {
    findOne: async () => mockOwner,
  };

  await t.test("sanitizeKycDetailDescriptors strips raw S3 keys and documentReferences from detail responses", () => {
    const sanitized = sanitizeKycDetailDescriptors(mockOwner);
    assert.equal(sanitized.companyRegistration.documentUrls, undefined);
    assert.equal(sanitized.companyRegistration.documentReferences, undefined);
    assert.equal(sanitized.companyRegistration.available, true);
    assert.equal(sanitized.companyRegistration.fileCount, 1);
    assert.equal(sanitized.insuranceCertificates[0].documentUrls, undefined);
  });

  await t.test("getKycDocumentReadUrl returns presigned downloadUrl without exposing raw objectKey", async () => {
    let presignCallCount = 0;
    const mockUrlService = {
      generateReadUrl: async () => {
        presignCallCount++;
        return {
          downloadUrl: "https://s3.amazonaws.com/presigned-url-token",
          expiresAt: "2026-08-04T12:05:00.000Z",
        };
      },
    };

    const controller = createKycDocumentReadController({
      BusOwner: mockBusOwnerModel,
      urlService: mockUrlService,
    });

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

  await t.test("Denied request produces zero presigning calls", async () => {
    let presignCallCount = 0;
    const mockUrlService = {
      generateReadUrl: async () => {
        presignCallCount++;
        return {};
      },
    };

    const controller = createKycDocumentReadController({
      BusOwner: mockBusOwnerModel,
      urlService: mockUrlService,
    });

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
});
