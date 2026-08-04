"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveAuthorizedKycDocumentReference, parseNonNegativeIndex } = require("../../../src/modules/bus-owner/kyc-document-read/kyc-document-reference.service");
const { createKycDocumentReadUrlService } = require("../../../src/modules/bus-owner/kyc-document-read/kyc-document-read-url.service");

test("kyc-document-reference-service unit tests", async (t) => {
  const actorOwner = { type: "BUS_OWNER", userId: "user-1" };
  const actorAdmin = { type: "ADMIN", userId: "admin-1" };
  const mockOwner = {
    _id: "owner-1",
    user: "user-1",
    companyRegistration: { documentUrls: ["owners/owner-1/kyc/reg.pdf"] },
    insuranceCertificates: [{ documentUrls: ["owners/owner-1/kyc/ins.pdf"] }],
    taxRegistration: { documentUrls: ["http://legacy-cdn.com/tax.pdf"] },
  };

  await t.test("Unknown document type is rejected with HTTP 400", () => {
    assert.throws(
      () => resolveAuthorizedKycDocumentReference({ actor: actorOwner, busOwner: mockOwner, documentType: "secretDoc" }),
      (err) => err.code === "KYC_DOCUMENT_READ_INVALID_REQUEST" && err.statusCode === 400
    );
  });

  await t.test("Invalid insurance index is rejected with HTTP 404", () => {
    assert.throws(
      () => resolveAuthorizedKycDocumentReference({ actor: actorOwner, busOwner: mockOwner, documentType: "insuranceCertificates", certificateIndex: 99 }),
      (err) => err.code === "KYC_DOCUMENT_READ_NOT_FOUND" && err.statusCode === 404
    );
  });

  await t.test("Invalid file index is rejected with HTTP 404", () => {
    assert.throws(
      () => resolveAuthorizedKycDocumentReference({ actor: actorOwner, busOwner: mockOwner, documentType: "companyRegistration", fileIndex: 5 }),
      (err) => err.code === "KYC_DOCUMENT_READ_NOT_FOUND" && err.statusCode === 404
    );
  });

  await t.test("Arbitrary objectKey input is ignored; server-stored reference is resolved", () => {
    const res = resolveAuthorizedKycDocumentReference({
      actor: actorOwner,
      busOwner: mockOwner,
      documentType: "companyRegistration",
      fileIndex: 0,
      objectKey: "owners/other-owner/kyc/hacked.pdf",
    });
    assert.equal(res.storageReference, "owners/owner-1/kyc/reg.pdf");
  });

  await t.test("Actual getPresignedUrl call receives TTL <= 300, not default 3600", async () => {
    let receivedTtl = null;
    const urlService = createKycDocumentReadUrlService({
      getPresignedUrl: async (key, ttl) => {
        receivedTtl = ttl;
        return `https://s3.amazonaws.com/${key}?signed=true`;
      },
    });

    await urlService.generateReadUrl({ actor: actorOwner, storageReference: "owners/owner-1/kyc/reg.pdf" });
    assert.ok(receivedTtl !== null, "TTL must be passed to getPresignedUrl");
    assert.ok(receivedTtl <= 300, `Expected TTL <= 300, got ${receivedTtl}`);
  });

  await t.test("Existing HTTP legacy URL is blocked for bus owner (HTTP 422)", async () => {
    const urlService = createKycDocumentReadUrlService({ getPresignedUrl: async () => null });
    await assert.rejects(
      async () => urlService.generateReadUrl({ actor: actorOwner, storageReference: "http://legacy-cdn.com/tax.pdf" }),
      (err) => err.code === "KYC_DOCUMENT_UNSUPPORTED_LEGACY" && err.statusCode === 422
    );
  });

  await t.test("Existing HTTP legacy URL is allowed for Admin reviewer", async () => {
    const urlService = createKycDocumentReadUrlService({ getPresignedUrl: async () => null });
    const result = await urlService.generateReadUrl({ actor: actorAdmin, storageReference: "http://legacy-cdn.com/tax.pdf" });
    assert.equal(result.downloadUrl, "http://legacy-cdn.com/tax.pdf");
    assert.equal(result.legacy, true);
  });
});

test("parseNonNegativeIndex strict validation", async (t) => {
  const { parseNonNegativeIndex } = require("../../../src/modules/bus-owner/kyc-document-read/kyc-document-reference.service");

  await t.test("undefined returns 0", () => assert.equal(parseNonNegativeIndex(undefined, "f"), 0));
  await t.test("null returns 0", () => assert.equal(parseNonNegativeIndex(null, "f"), 0));
  await t.test("empty string returns 0", () => assert.equal(parseNonNegativeIndex("", "f"), 0));
  await t.test("'0' returns 0", () => assert.equal(parseNonNegativeIndex("0", "f"), 0));
  await t.test("'1' returns 1", () => assert.equal(parseNonNegativeIndex("1", "f"), 1));

  const cases = ["abc", "-1", "1.5", "1abc", " ", "  3  "];
  for (const val of cases) {
    await t.test(`'${val}' is rejected with HTTP 400`, () => {
      assert.throws(
        () => parseNonNegativeIndex(val, "fileIndex"),
        (err) => err.code === "KYC_DOCUMENT_READ_INVALID_REQUEST" && err.statusCode === 400,
        `Expected 400 for input '${val}'`
      );
    });
  }
});
