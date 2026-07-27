"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createBusOwnerFull,
} = require("../../src/modules/admin/bus-owner-management/owner-creation.controller");
const {
  getBusOwnerById,
} = require("../../src/modules/admin/bus-owner-management/owner-query.controller");
const {
  getBusOwnerKycById,
} = require("../../src/modules/admin/bus-owner-management/kyc-query.controller");
const {
  updateBusOwnerKyc,
} = require("../../src/modules/admin/bus-owner-management/kyc-review.controller");
const {
  reuploadKycDocument,
} = require("../../src/modules/admin/bus-owner-management/kyc-document.controller");

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

test("creation rejects missing required owner and bank fields", async () => {
  assert.deepEqual(await invoke(createBusOwnerFull, { body: {} }), {
    statusCode: 400,
    body: {
      success: false,
      message: "Missing required fields for Company or Bank details.",
    },
  });
});

test("owner and KYC details preserve missing and invalid ID responses", async () => {
  for (const handler of [getBusOwnerById, getBusOwnerKycById, updateBusOwnerKyc]) {
    assert.deepEqual(await invoke(handler, { body: {} }), {
      statusCode: 400,
      body: { success: false, message: "Id is required!" },
    });
    assert.deepEqual(await invoke(handler, { body: { id: "invalid" } }), {
      statusCode: 400,
      body: { success: false, message: "Invalid id format!" },
    });
  }
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
