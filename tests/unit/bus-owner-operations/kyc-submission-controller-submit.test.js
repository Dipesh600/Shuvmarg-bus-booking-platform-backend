"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createCloudinaryUploadService } = require("../../../src/modules/bus-owner/kyc-submission/cloudinary-upload.service");
const { createKycSubmissionController } = require("../../../src/modules/bus-owner/kyc-submission/kyc-submission.controller");
const { PDF_BUFFER, JPEG_BUFFER, PNG_BUFFER, makeFile, makeValidFiles, responseRecorder } = require("./helpers/kyc-test-fixtures");

test("bus-owner KYC submission controller submit contracts", async (t) => {
  await t.test("cloud upload preserves base64, folder, order, overwrite and returns publicId", async () => {
    const calls = [];
    const service = createCloudinaryUploadService({
      cloudinary: {
        uploader: {
          upload: async (...args) => {
            calls.push(args);
            return { secure_url: `url-${calls.length}`, public_id: `pub-${calls.length}` };
          },
        },
      },
    });
    const files = [makeFile("one.png", "image/png", PNG_BUFFER), makeFile("two.jpg", "image/jpeg", JPEG_BUFFER)];
    assert.deepEqual(await service.uploadMany(files, "kyc/folder"), [
      { url: "url-1", publicId: "pub-1" },
      { url: "url-2", publicId: "pub-2" },
    ]);
    assert.equal(calls[0][0], `data:image/png;base64,${PNG_BUFFER.toString("base64")}`);
    assert.deepEqual(calls[0][1], { folder: "kyc/folder", overwrite: true });
  });

  await t.test("submission creates owner and sets all document state upon valid payload", async () => {
    const uploads = [];
    let created;
    function BusOwner(value) {
      created = Object.assign(this, value);
      this.save = async () => { this.saved = true; };
    }
    BusOwner.findOne = async () => null;

    const controller = createKycSubmissionController({
      BusOwner,
      uploadService: {
        uploadMany: async (files, folder) => {
          uploads.push([files, folder]);
          return [{ url: folder.includes("insurance") ? "insurance-url" : "doc-url", publicId: "pub-1" }];
        },
      },
    });

    const validFiles = makeValidFiles();
    validFiles.insuranceCertificates = [makeFile("ins.pdf", "application/pdf", PDF_BUFFER)];

    const res = responseRecorder();
    await controller.submitBusOwnerKyc({ userInfo: { id: "owner" }, files: validFiles }, res);

    assert.equal(res.result().status, 200);
    assert.equal(created.user, "owner");
    assert.deepEqual(created.companyRegistration, { documentUrls: ["doc-url"], verified: false, rejectionReason: null });
    assert.equal(created.verificationStatus, "pending");
    assert.equal(created.saved, true);
    assert.equal(uploads.length, 4);
  });

  await t.test("controller returns HTTP 400 with domain error structure for invalid documents", async () => {
    function MockBusOwner(val) { Object.assign(this, val); }
    MockBusOwner.findOne = async () => null;

    const controller = createKycSubmissionController({ BusOwner: MockBusOwner, uploadService: {} });
    const res = responseRecorder();
    await controller.submitBusOwnerKyc({ userInfo: { id: "owner" }, files: {} }, res);

    assert.equal(res.result().status, 400);
    assert.equal(res.result().body.success, false);
    assert.equal(res.result().body.code, "KYC_FILES_REQUIRED");
  });

  await t.test("controller returns HTTP 400 KYC_INVALID_FILE_PAYLOAD for malformed file object without upload or save calls", async () => {
    let uploadCalled = false;
    let saveCalled = false;
    function MockBusOwner(val) {
      Object.assign(this, val);
      this.save = async () => { saveCalled = true; };
    }
    MockBusOwner.findOne = async () => null;

    const controller = createKycSubmissionController({
      BusOwner: MockBusOwner,
      uploadService: { uploadMany: async () => { uploadCalled = true; return []; } },
    });

    const malformedFiles = makeValidFiles();
    malformedFiles.companyRegistration = [null];

    const res = responseRecorder();
    await controller.submitBusOwnerKyc({ userInfo: { id: "owner" }, files: malformedFiles }, res);

    assert.equal(res.result().status, 400);
    assert.equal(res.result().body.success, false);
    assert.equal(res.result().body.code, "KYC_INVALID_FILE_PAYLOAD");
    assert.equal(uploadCalled, false);
    assert.equal(saveCalled, false);
  });

  await t.test("controller returns sanitized HTTP 500 without leaking stack or internal error text", async () => {
    function BusOwner() {}
    BusOwner.findOne = async () => { throw new Error("Sensitive DB connection string"); };

    const controller = createKycSubmissionController({ BusOwner, uploadService: {} });
    const res = responseRecorder();
    await controller.submitBusOwnerKyc({ userInfo: { id: "owner" }, files: makeValidFiles() }, res);

    assert.equal(res.result().status, 500);
    assert.equal(res.result().body.success, false);
    assert.equal(res.result().body.message, "Internal Server Error");
    assert.equal("error" in res.result().body, false);
  });
});
