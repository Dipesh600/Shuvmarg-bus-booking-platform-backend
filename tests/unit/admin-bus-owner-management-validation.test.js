"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createBusOwnerFull,
} = require("../../src/modules/admin/bus-owner-management/owner-creation.controller");
const {
  createOwnerQueryController,
} = require("../../src/modules/admin/bus-owner-management/owner-query.controller");
const {
  createKycQueryController,
} = require("../../src/modules/admin/bus-owner-management/kyc-query.controller");
const {
  updateBusOwnerKyc,
} = require("../../src/modules/admin/bus-owner-management/kyc-review.controller");
const {
  reuploadKycDocument,
} = require("../../src/modules/admin/bus-owner-management/kyc-document.controller");
const {
  createAdminBusOwnerReadService,
} = require("../../src/modules/read-contracts/admin-bus-owner/admin-bus-owner-read.service");
const {
  createAdminKycReadService,
} = require("../../src/modules/read-contracts/admin-kyc/admin-kyc-read.service");

const response = () => {
  let statusCode;
  let body;
  return {
    status(code) {
      statusCode = code;
      return this;
    },
    json(value) {
      body = value;
      return this;
    },
    result: () => ({ statusCode, body }),
  };
};

const invoke = async (handler, req) => {
  const res = response();
  await handler(req, res);
  return res.result();
};

const mockAdminReq = {
  adminInfo: { id: "507f1f77bcf86cd799439011", role: "SUPER_ADMIN" },
};

const mockOwnerReadService = createAdminBusOwnerReadService({
  resolveAdminActor: async () => ({ _id: "507f1f77bcf86cd799439011" }),
});

const mockKycReadService = createAdminKycReadService({
  resolveAdminActor: async () => ({ _id: "507f1f77bcf86cd799439011" }),
});

const ownerQuery = createOwnerQueryController({ adminBusOwnerReadService: mockOwnerReadService });
const kycQuery = createKycQueryController({ readService: mockKycReadService });

test("creation rejects missing required owner and bank fields", async () => {
  assert.deepEqual(await invoke(createBusOwnerFull, { body: {} }), {
    statusCode: 400,
    body: {
      success: false,
      message: "Missing required fields for Company or Bank details.",
    },
  });
});

test("owner and KYC details preserve canonical READ_INVALID_ID responses", async () => {
  const missingResOwner = await invoke(ownerQuery.getBusOwnerById, { ...mockAdminReq, params: {} });
  assert.equal(missingResOwner.statusCode, 400);
  assert.equal(missingResOwner.body.success, false);
  assert.equal(missingResOwner.body.error.code, "READ_INVALID_ID");

  const invalidResOwner = await invoke(ownerQuery.getBusOwnerById, { ...mockAdminReq, params: { ownerId: "invalid" } });
  assert.equal(invalidResOwner.statusCode, 400);
  assert.equal(invalidResOwner.body.success, false);
  assert.equal(invalidResOwner.body.error.code, "READ_INVALID_ID");

  const missingResKyc = await invoke(kycQuery.getBusOwnerKycById, { ...mockAdminReq, params: {} });
  assert.equal(missingResKyc.statusCode, 400);
  assert.equal(missingResKyc.body.success, false);
  assert.equal(missingResKyc.body.error.code, "READ_INVALID_ID");

  const invalidResKyc = await invoke(kycQuery.getBusOwnerKycById, { ...mockAdminReq, params: { kycId: "invalid" } });
  assert.equal(invalidResKyc.statusCode, 400);
  assert.equal(invalidResKyc.body.success, false);
  assert.equal(invalidResKyc.body.error.code, "READ_INVALID_ID");

  assert.deepEqual(await invoke(updateBusOwnerKyc, { body: {} }), {
    statusCode: 400,
    body: { success: false, message: "Id is required!" },
  });
  assert.deepEqual(await invoke(updateBusOwnerKyc, { body: { id: "invalid" } }), {
    statusCode: 400,
    body: { success: false, message: "Invalid id format!" },
  });
});

test("KYC document re-upload preserves request validation contracts", async () => {
  assert.deepEqual(await invoke(reuploadKycDocument, { body: {} }), {
    statusCode: 400,
    body: {
      success: false,
      message: "Bus Owner ID and Document Type are required.",
    },
  });
  assert.deepEqual(
    await invoke(reuploadKycDocument, {
      body: { id: "507f1f77bcf86cd799439011", documentType: "passport" },
    }),
    {
      statusCode: 400,
      body: { success: false, message: "Invalid document type." },
    }
  );
});
