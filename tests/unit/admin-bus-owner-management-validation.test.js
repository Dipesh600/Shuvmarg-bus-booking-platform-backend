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
  for (const handler of [ownerQuery.getBusOwnerById, kycQuery.getBusOwnerKycById]) {
    const missingRes = await invoke(handler, { ...mockAdminReq, body: {} });
    assert.equal(missingRes.statusCode, 400);
    assert.equal(missingRes.body.success, false);
    assert.equal(missingRes.body.error.code, "READ_INVALID_ID");

    const invalidRes = await invoke(handler, { ...mockAdminReq, body: { id: "invalid" } });
    assert.equal(invalidRes.statusCode, 400);
    assert.equal(invalidRes.body.success, false);
    assert.equal(invalidRes.body.error.code, "READ_INVALID_ID");
  }

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
