"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createKycDocumentReadController } = require("../../../src/modules/bus-owner/kyc-document-read/kyc-document-read.controller");

const owner = {
  _id: "64f000000000000000000001", user: "64f000000000000000000002",
  companyRegistration: { documentUrls: ["owners/owner-1/kyc/secret.pdf"] },
};
const BusOwner = { findOne: async () => owner };
function response() {
  const res = { headersSent: false };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  res.setHeader = () => res;
  return res;
}
const request = (userId) => ({
  userInfo: { id: userId },
  query: { id: owner._id, documentType: "companyRegistration", fileIndex: "0" },
});

test("denied stream request never reads the object", async () => {
  let fetchCallCount = 0;
  const controller = createKycDocumentReadController({
    BusOwner, urlService: { fetchDocument: async () => { fetchCallCount++; return {}; } },
  });
  const res = response();
  await controller.viewKycDocument(request("64f000000000000000000099"), res);
  assert.equal(res.statusCode, 403);
  assert.equal(fetchCallCount, 0);
});

test("stream rejects an unsupported stored media type", async () => {
  const controller = createKycDocumentReadController({
    BusOwner,
    urlService: { fetchDocument: async () => ({ Body: { pipe() {} }, ContentType: "text/html" }) },
  });
  const res = response();
  await controller.viewKycDocument(request(owner.user), res);
  assert.equal(res.statusCode, 415);
  assert.equal(res.body.success, false);
});
