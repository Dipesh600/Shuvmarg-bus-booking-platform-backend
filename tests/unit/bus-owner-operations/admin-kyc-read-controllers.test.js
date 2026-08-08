"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createKycQueryController } = require("../../../src/modules/admin/bus-owner-management/kyc-query.controller");
const { sanitizeKycDetailDescriptors } = require("../../../src/modules/bus-owner/kyc-document-read/kyc-document-read.controller");

function responseRecorder() {
  let statusCode = 200;
  let responseData = null;

  return {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      responseData = data;
      return this;
    },
    result() {
      return { status: statusCode, body: responseData };
    },
  };
}

test("admin KYC read controllers expose list and detail endpoints", async (t) => {
  await t.test("kyc-query.controller.getAllBusOwnerKycs returns 200 with list data", async () => {
    const listData = [
      {
        _id: "507f1f77bcf86cd799439011",
        ownerName: "Hari Bahadur",
        companyName: "Pokhara Express",
        verificationStatus: "APPROVED",
        submittedAt: "2026-03-01T10:00:00Z",
      },
    ];

    const controller = createKycQueryController({
      readService: {
        listKycQueue: async () => ({ success: true, data: { items: listData, pagination: { totalItems: 1 } } }),
      },
    });

    const res = responseRecorder();
    await controller.getAllBusOwnerKycs({}, res);

    assert.equal(res.result().status, 200);
    assert.equal(res.result().body.success, true);
    assert.deepEqual(res.result().body.data.items, listData);
  });

  await t.test("kyc-query.controller.getBusOwnerKycById returns 200 with detail data", async () => {
    const detailData = {
      _id: "507f1f77bcf86cd799439011",
      ownerName: "Hari Bahadur",
      companyRegistration: { available: true, fileCount: 1 },
    };

    const controller = createKycQueryController({
      readService: {
        getKycDetail: async (req) => ({ success: true, data: detailData }),
      },
    });

    const res = responseRecorder();
    await controller.getBusOwnerKycById({ params: { kycId: "507f1f77bcf86cd799439011" } }, res);

    assert.equal(res.result().status, 200);
    assert.equal(res.result().body.success, true);
    assert.equal(res.result().body.data.ownerName, "Hari Bahadur");
  });

  await t.test("kyc-query.controller resolves S3 keys into presigned URLs for getBusOwnerKycById", async () => {
    const rawOwner = {
      _id: "507f1f77bcf86cd799439011",
      companyRegistration: { documentUrls: ["owners/1/kyc/c.pdf"] },
    };
    const sanitized = sanitizeKycDetailDescriptors(rawOwner);

    const controller = createKycQueryController({
      readService: {
        getKycDetail: async () => ({ success: true, data: sanitized }),
      },
    });

    const res = responseRecorder();
    await controller.getBusOwnerKycById({ params: { kycId: "507f1f77bcf86cd799439011" } }, res);

    assert.equal(res.result().status, 200);
    assert.equal(res.result().body.data.companyRegistration.documentUrls, undefined);
    assert.equal(res.result().body.data.companyRegistration.documentReferences, undefined);
    assert.equal(res.result().body.data.companyRegistration.fileCount, 1);
    assert.equal(res.result().body.data.companyRegistration.available, true);
  });
});
