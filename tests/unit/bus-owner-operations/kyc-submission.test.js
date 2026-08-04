"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createCloudinaryUploadService,
} = require("../../../src/modules/bus-owner/kyc-submission/cloudinary-upload.service");
const {
  createKycSubmissionController,
} = require("../../../src/modules/bus-owner/kyc-submission/kyc-submission.controller");

const PDF_BUFFER = Buffer.concat([Buffer.from("%PDF-1.4\n%"), Buffer.alloc(100)]);
const JPEG_BUFFER = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100)]);
const PNG_BUFFER = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100)]);

function makeFile(name, mimetype, buffer) {
  return { name, mimetype, data: buffer, size: buffer.length };
}

function makeValidFiles() {
  return {
    companyRegistration: makeFile("company.pdf", "application/pdf", PDF_BUFFER),
    taxRegistration: makeFile("tax.jpg", "image/jpeg", JPEG_BUFFER),
    transportLicense: makeFile("license.png", "image/png", PNG_BUFFER),
  };
}

function response() {
  let status;
  let body;
  return {
    status(value) { status = value; return this; },
    json(value) { body = value; return this; },
    result: () => ({ status, body }),
  };
}

test("bus-owner KYC submission contracts", async (t) => {
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
    const files = [
      makeFile("one.png", "image/png", PNG_BUFFER),
      makeFile("two.jpg", "image/jpeg", JPEG_BUFFER),
    ];
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

    const res = response();
    await controller.submitBusOwnerKyc({
      userInfo: { id: "owner" },
      files: validFiles,
    }, res);

    assert.equal(res.result().status, 200);
    assert.equal(created.user, "owner");
    assert.deepEqual(created.companyRegistration, {
      documentUrls: ["doc-url"], verified: false, rejectionReason: null,
    });
    assert.deepEqual(created.insuranceCertificates[0], {
      insurerName: null,
      policyNumber: null,
      validTill: null,
      documentUrls: ["insurance-url"],
      verified: false,
      rejectionReason: null,
    });
    assert.equal(created.verificationStatus, "pending");
    assert.equal(created.rejectionReason, null);
    assert.equal(created.saved, true);
    assert.equal(uploads.length, 4);
  });

  await t.test("controller returns HTTP 400 with domain error structure for invalid documents", async () => {
    function MockBusOwner(val) { Object.assign(this, val); }
    MockBusOwner.findOne = async () => null;

    const controller = createKycSubmissionController({
      BusOwner: MockBusOwner,
      uploadService: {},
    });
    const res = response();
    await controller.submitBusOwnerKyc({
      userInfo: { id: "owner" },
      files: {},
    }, res);

    assert.equal(res.result().status, 400);
    assert.equal(res.result().body.success, false);
    assert.equal(res.result().body.code, "KYC_FILES_REQUIRED");
  });

  await t.test("controller returns sanitized HTTP 500 without leaking stack or internal error text", async () => {
    function BusOwner() {}
    BusOwner.findOne = async () => { throw new Error("Sensitive DB connection string"); };

    const controller = createKycSubmissionController({
      BusOwner, uploadService: {},
    });
    const res = response();
    await controller.submitBusOwnerKyc({
      userInfo: { id: "owner" },
      files: makeValidFiles(),
    }, res);

    assert.equal(res.result().status, 500);
    assert.equal(res.result().body.success, false);
    assert.equal(res.result().body.message, "Internal Server Error");
    assert.equal("error" in res.result().body, false);
  });

  await t.test("status response exposes only the legacy KYC fields", async () => {
    const owner = {
      verificationStatus: "pending",
      rejectionReason: null,
      companyRegistration: { verified: false },
      ignored: "secret",
    };
    const controller = createKycSubmissionController({
      BusOwner: { findOne: () => ({ lean: async () => owner }) },
      uploadService: {},
    });
    const res = response();
    await controller.getMyBusOwnerKycStatus(
      { userInfo: { id: "owner" } }, res
    );
    assert.equal(res.result().status, 200);
    assert.equal(res.result().body.data.verificationStatus, "pending");
    assert.equal("ignored" in res.result().body.data, false);
  });

  await t.test("both endpoints preserve unauthorized response", async () => {
    const controller = createKycSubmissionController({
      BusOwner: {}, uploadService: {},
    });
    for (const handler of [
      controller.submitBusOwnerKyc,
      controller.getMyBusOwnerKycStatus,
    ]) {
      const res = response();
      await handler({}, res);
      assert.deepEqual(res.result(), {
        status: 401,
        body: {
          success: false,
          message: "Unauthorized. Please login first.",
        },
      });
    }
  });
});
