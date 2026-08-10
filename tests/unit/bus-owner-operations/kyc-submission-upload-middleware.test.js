"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const request = require("supertest");
const {
  MAX_KYC_PARTS,
  MAX_KYC_REQUEST_SIZE,
  MAX_TEXT_FIELDS,
  parseKycSubmissionUpload,
  rejectOversizedKycRequest,
} = require("../../../middleware/kycSubmissionUpload");
const {
  ALLOWED_FIELDS,
} = require("../../../src/modules/bus-owner/kyc-submission/bus-owner-onboarding.validator");
const {
  MAX_TOTAL_FILES,
} = require("../../../src/modules/bus-owner/kyc-submission/kyc-document.policy");

function responseRecorder() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("KYC request-size guard accepts bounded and rejects oversized uploads", () => {
  let nextCalls = 0;
  const accepted = responseRecorder();
  rejectOversizedKycRequest(
    { headers: { "content-length": String(MAX_KYC_REQUEST_SIZE) } },
    accepted,
    () => { nextCalls += 1; }
  );
  assert.equal(nextCalls, 1);

  const rejected = responseRecorder();
  rejectOversizedKycRequest(
    { headers: { "content-length": String(MAX_KYC_REQUEST_SIZE + 1) } },
    rejected,
    () => { nextCalls += 1; }
  );
  assert.equal(rejected.statusCode, 413);
  assert.equal(rejected.body.code, "KYC_REQUEST_TOO_LARGE");
  assert.equal(nextCalls, 1);
});

test("KYC request-size guard rejects malformed content length", () => {
  const response = responseRecorder();
  rejectOversizedKycRequest(
    { headers: { "content-length": "not-a-number" } },
    response,
    () => assert.fail("next must not run")
  );
  assert.equal(response.statusCode, 400);
  assert.equal(response.body.code, "KYC_INVALID_CONTENT_LENGTH");
});

test("KYC multipart limits stay aligned with the onboarding and document contracts", () => {
  assert.equal(MAX_TEXT_FIELDS, ALLOWED_FIELDS.size);
  assert.ok(MAX_TEXT_FIELDS >= 15, "current operator form can submit 15 text fields");
  assert.equal(MAX_KYC_PARTS, MAX_TEXT_FIELDS + MAX_TOTAL_FILES);
});

test("KYC upload middleware parses the complete operator form and maximum document count", async () => {
  const app = express();
  app.post("/kyc", parseKycSubmissionUpload, (req, res) => {
    const uploadedFiles = Object.values(req.files || {}).flatMap((value) =>
      Array.isArray(value) ? value : [value]
    );
    res.status(200).json({
      fieldNames: Object.keys(req.body || {}).sort(),
      fileCount: uploadedFiles.length,
    });
  });

  const completeForm = {
    companyName: "Shuvmarg Travels",
    ownerName: "Ram Owner",
    registeredTole: "New Road",
    registeredWardNumber: "4",
    registeredMunicipality: "Kathmandu Metropolitan City",
    registeredDistrict: "Kathmandu",
    registeredProvince: "Bagmati",
    registeredCountry: "Nepal",
    panNumber: "123456789",
    registrationNumber: "REG-001",
    bankName: "Nepal Bank Ltd.",
    accountHolderName: "Ram Owner",
    accountNumber: "00123456789",
    branchName: "New Road",
    swiftCode: "NBLNNPKA",
  };

  let submission = request(app).post("/kyc");
  for (const [field, value] of Object.entries(completeForm)) {
    submission = submission.field(field, value);
  }

  const pdf = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n");
  submission = submission
    .attach("companyRegistration", pdf, { filename: "company.pdf", contentType: "application/pdf" })
    .attach("taxRegistration", pdf, { filename: "tax.pdf", contentType: "application/pdf" })
    .attach("ownerIdentity", pdf, { filename: "citizenship.pdf", contentType: "application/pdf" });

  const response = await submission.expect(200);
  assert.deepEqual(response.body.fieldNames, Object.keys(completeForm).sort());
  assert.equal(response.body.fileCount, MAX_TOTAL_FILES);
});
