"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createCloudinaryUploadService,
} = require("../../../src/modules/bus-owner/kyc-submission/cloudinary-upload.service");
const {
  createKycSubmissionController,
} = require("../../../src/modules/bus-owner/kyc-submission/kyc-submission.controller");

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
  await t.test("cloud upload preserves base64, folder, order, and overwrite", async () => {
    const calls = [];
    const service = createCloudinaryUploadService({
      cloudinary: {
        uploader: {
          upload: async (...args) => {
            calls.push(args);
            return { secure_url: `url-${calls.length}` };
          },
        },
      },
    });
    const files = [
      { mimetype: "image/png", data: Buffer.from("one") },
      { mimetype: "image/jpeg", data: Buffer.from("two") },
    ];
    assert.deepEqual(await service.uploadMany(files, "kyc/folder"), [
      "url-1", "url-2",
    ]);
    assert.equal(calls[0][0], "data:image/png;base64,b25l");
    assert.deepEqual(calls[0][1], { folder: "kyc/folder", overwrite: true });
  });

  await t.test("submission creates owner and resets all document state", async () => {
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
          return folder.includes("insurance") ? ["insurance-url"] : ["doc-url"];
        },
      },
    });
    const res = response();
    await controller.submitBusOwnerKyc({
      userInfo: { id: "owner" },
      files: {
        companyRegistration: "company-file",
        insuranceCertificates: ["insurance-file"],
      },
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
    assert.equal(uploads.length, 2);
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
