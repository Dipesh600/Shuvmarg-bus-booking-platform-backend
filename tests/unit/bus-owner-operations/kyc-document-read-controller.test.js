"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createKycDocumentReadController } = require("../../../src/modules/bus-owner/kyc-document-read/kyc-document-read.controller");

function createMockResponse() {
  const headers = {};
  const res = {
    statusCode: null,
    body: null,
    headers,
    headersSent: false,
    status(code) { res.statusCode = code; return res; },
    json(value) { res.body = value; return res; },
    setHeader(name, value) { headers[name] = value; return res; },
    end() { res.ended = true; return res; },
    destroy(error) { res.destroyedWith = error; },
  };
  return res;
}

function createMockObjectBody() {
  return {
    errorHandler: null,
    pipedTo: null,
    on(event, handler) {
      if (event === "error") this.errorHandler = handler;
      return this;
    },
    pipe(target) {
      this.pipedTo = target;
      target.headersSent = true;
      return target;
    },
  };
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

  await t.test("viewKycDocument streams the authorized stored object without exposing its key", async () => {
    const body = createMockObjectBody();
    let fetchedReference = null;
    const controller = createKycDocumentReadController({
      BusOwner: makeMockBusOwnerModel(),
      urlService: {
        fetchDocument: async (storageReference) => {
          fetchedReference = storageReference;
          return { Body: body, ContentType: "application/pdf", ContentLength: 321 };
        },
      },
    });
    const req = {
      userInfo: { id: "64f000000000000000000002" },
      query: { id: "64f000000000000000000001", documentType: "companyRegistration", fileIndex: "0" },
    };
    const res = createMockResponse();

    await controller.viewKycDocument(req, res);

    assert.equal(fetchedReference, "owners/owner-1/kyc/secret.pdf");
    assert.equal(body.pipedTo, res);
    assert.equal(res.headers["Content-Type"], "application/pdf");
    assert.equal(res.headers["Cache-Control"], "private, no-store, max-age=0");
    assert.equal(res.headers["X-Content-Type-Options"], "nosniff");
    assert.equal(res.headers["Content-Disposition"], 'inline; filename="companyRegistration.pdf"');
    assert.equal(res.body, null, "stream response must not serialize a key or signed URL");
  });

});
