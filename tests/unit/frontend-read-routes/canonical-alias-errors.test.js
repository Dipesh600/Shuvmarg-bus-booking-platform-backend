"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createAdminFrontendReadController } = require("../../../src/modules/read-contracts/routes/admin-frontend-read.controller.js");
const { ReadContractValidationError, ReadContractNotFoundError } = require("../../../src/modules/read-contracts/common/read-errors.js");

function mockRes() {
  let statusVal = 200;
  let bodyVal = null;
  return {
    status(code) { statusVal = code; return this; },
    json(payload) { bodyVal = payload; return this; },
    get result() { return { status: statusVal, body: bodyVal }; },
  };
}

test("Canonical route and alias error contract equality", async (t) => {
  await t.test("1. Invalid ID produces canonical READ_INVALID_ID nested error envelope", async () => {
    const controller = createAdminFrontendReadController({
      adminBusOwnerReadService: {
        getBusOwnerDetail: async () => {
          throw new ReadContractValidationError("READ_INVALID_ID", "Invalid bus owner ID format.");
        },
      },
    });

    const res = mockRes();
    await controller.getBusOwnerDetail({ params: { ownerId: "invalid-id" } }, res);

    assert.equal(res.result.status, 400);
    assert.equal(res.result.body.success, false);
    assert.equal(res.result.body.error.code, "READ_INVALID_ID");
    assert.equal(res.result.body.error.message, "Resource identifier format is invalid.");
  });

  await t.test("2. Not found produces canonical FLEET_NOT_FOUND error envelope", async () => {
    const controller = createAdminFrontendReadController({
      fleetReadService: {
        getFleetDetailForAdmin: async () => {
          throw new ReadContractNotFoundError("FLEET_NOT_FOUND", "Fleet record not found.");
        },
      },
    });

    const res = mockRes();
    await controller.getFleetDetail({ params: { fleetId: "507f1f77bcf86cd799439011" } }, res);

    assert.equal(res.result.status, 404);
    assert.equal(res.result.body.success, false);
    assert.equal(res.result.body.error.code, "FLEET_NOT_FOUND");
    assert.equal(res.result.body.error.message, "Fleet record not found.");
  });

  await t.test("3. Ensure no legacy top-level error format is emitted", async () => {
    const controller = createAdminFrontendReadController({
      adminKycReadService: {
        getKycDetail: async () => {
          throw new ReadContractValidationError("READ_INVALID_ID", "Invalid owner ID format.");
        },
      },
    });

    const res = mockRes();
    await controller.getKycDetail({ params: { kycId: "bad-id" } }, res);

    assert.equal(res.result.body.success, false);
    assert.ok(res.result.body.error);
    assert.equal("message" in res.result.body && !("error" in res.result.body), false);
  });
});
