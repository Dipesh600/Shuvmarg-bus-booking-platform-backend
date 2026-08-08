"use strict";

// Spec items 3, 4, 5, 6, 7 + legacy HTTP policy:
//   [ ] Authenticated admin can request a bus-owner document
//   [ ] Missing admin authentication is rejected
//   [ ] Ordinary bus-owner token cannot call the admin route
//   [ ] Admin request still cannot supply an arbitrary objectKey
//   [ ] Admin receives a five-minute presigned URL (TTL ≤ 300 s)

const test = require("node:test");
const assert = require("node:assert/strict");
const { createKycDocumentReadController } = require("../../../src/modules/bus-owner/kyc-document-read/kyc-document-read.controller");
const { createKycDocumentReadUrlService } = require("../../../src/modules/bus-owner/kyc-document-read/kyc-document-read-url.service");

const STORED_KEY = "owners/owner-42/kyc/reg.pdf";

function makeRes() {
  const res = { statusCode: null, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json   = (v) => { res.body  = v; return res; };
  return res;
}

function makeMockModel(userId = "64f000000000000000000002") {
  return {
    findOne: async () => ({
      _id: "64f000000000000000000001",
      user: userId,
      companyRegistration: { documentUrls: [STORED_KEY] },
      insuranceCertificates: [],
    }),
  };
}

function makePresignService(onCall) {
  return createKycDocumentReadUrlService({ getPresignedUrl: onCall });
}

test("admin KYC document-read controller auth and authorization", async (t) => {
  let capturedTtl = null;
  const urlService = makePresignService(async (key, ttl) => {
    capturedTtl = ttl;
    return `https://s3.example.com/${key}`;
  });
  const controller = createKycDocumentReadController({
    BusOwner: makeMockModel(),
    urlService,
  });

  // 3: authenticated admin succeeds
  await t.test("authenticated admin receives 200 with a downloadUrl", async () => {
    const res = makeRes();
    await controller.getKycDocumentReadUrl(
      { adminInfo: { id: "admin-99" },
        query: { id: "64f000000000000000000001", documentType: "companyRegistration", fileIndex: "0" } },
      res
    );
    assert.equal(res.statusCode, 200);
    assert.ok(res.body.data.downloadUrl.length > 0);
  });

  // 4: no auth returns 401
  await t.test("request with no credentials returns 401", async () => {
    const res = makeRes();
    await controller.getKycDocumentReadUrl(
      { query: { id: "64f000000000000000000001", documentType: "companyRegistration" } },
      res
    );
    assert.equal(res.statusCode, 401);
  });

  // 5: bus-owner token targeting a different owner is blocked at policy
  await t.test("bus-owner token cross-owner request returns 403", async () => {
    const res = makeRes();
    await controller.getKycDocumentReadUrl(
      { userInfo: { id: "different-user-99" },
        query: { id: "64f000000000000000000001", documentType: "companyRegistration", fileIndex: "0" } },
      res
    );
    assert.equal(res.statusCode, 403);
  });

  // 6: caller-supplied objectKey is ignored; server resolves stored reference
  await t.test("caller-supplied objectKey is ignored; stored reference is signed", async () => {
    let signedKey = null;
    const capCtrl = createKycDocumentReadController({
      BusOwner: makeMockModel(),
      urlService: makePresignService(async (key) => { signedKey = key; return `https://s3.example.com/${key}`; }),
    });
    const res = makeRes();
    await capCtrl.getKycDocumentReadUrl({
      adminInfo: { id: "admin-99" },
      query: { id: "64f000000000000000000001", documentType: "companyRegistration", fileIndex: "0" },
      body:  { objectKey: "owners/OTHER/kyc/hacked.pdf" },
    }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(signedKey, STORED_KEY);
  });

  // 7: TTL forwarded to getPresignedUrl is ≤ 300 s
  await t.test("getPresignedUrl receives TTL ≤ 300 s, not the 3600-s default", async () => {
    capturedTtl = null;
    const res = makeRes();
    await controller.getKycDocumentReadUrl(
      { adminInfo: { id: "admin-99" },
        query: { id: "64f000000000000000000001", documentType: "companyRegistration", fileIndex: "0" } },
      res
    );
    assert.ok(capturedTtl !== null, "TTL must be forwarded");
    assert.ok(capturedTtl <= 300, `Expected ≤ 300 s, got ${capturedTtl}`);
  });

  // Legacy HTTP: returned as-is with legacy:true, expiresAt:null, no presigning
  await t.test("legacy HTTP reference is returned as-is with legacy:true and expiresAt null", async () => {
    const legacyCtrl = createKycDocumentReadController({
      BusOwner: { findOne: async () => ({
        _id: "64f000000000000000000001", user: "64f000000000000000000002",
        companyRegistration: { documentUrls: ["http://cdn.legacy.example.com/doc.pdf"] },
        insuranceCertificates: [],
      }) },
      urlService: makePresignService(async () => { throw new Error("must not sign legacy"); }),
    });
    const res = makeRes();
    await legacyCtrl.getKycDocumentReadUrl(
      { adminInfo: { id: "admin-99" },
        query: { id: "64f000000000000000000001", documentType: "companyRegistration", fileIndex: "0" } },
      res
    );
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.legacy, true);
    assert.equal(res.body.data.expiresAt, null);
    assert.equal(res.body.data.downloadUrl, "http://cdn.legacy.example.com/doc.pdf");
  });
});
