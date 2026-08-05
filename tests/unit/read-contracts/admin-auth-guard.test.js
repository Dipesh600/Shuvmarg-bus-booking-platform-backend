"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createAdminBusOwnerReadService } = require("../../../src/modules/read-contracts/admin-bus-owner/admin-bus-owner-read.service");
const { createAdminKycReadService } = require("../../../src/modules/read-contracts/admin-kyc/admin-kyc-read.service");
const { createFleetReadService } = require("../../../src/modules/read-contracts/fleet/fleet-read.service");
const { ReadContractUnauthorizedError, ReadContractForbiddenError } = require("../../../src/modules/read-contracts/common/read-errors");

test("admin auth guard unit tests across read services", async (t) => {
  await t.test("missing admin actor throws ReadContractUnauthorizedError (401) and bypasses repository", async () => {
    let repoCalled = false;
    const mockRepo = { findPaginatedOwners: async () => { repoCalled = true; return { items: [], totalItems: 0 }; } };

    const service = createAdminBusOwnerReadService({ repository: mockRepo });
    const reqWithoutAdmin = {};

    await assert.rejects(
      () => service.listBusOwners(reqWithoutAdmin),
      (err) => err instanceof ReadContractUnauthorizedError && err.statusCode === 401
    );

    assert.equal(repoCalled, false);
  });

  await t.test("missing resolved admin record throws ReadContractUnauthorizedError (401)", async () => {
    let repoCalled = false;
    const mockRepo = { findPaginatedKycs: async () => { repoCalled = true; return { items: [], totalItems: 0 }; } };

    const service = createAdminKycReadService({
      repository: mockRepo,
      resolveAdminActor: async () => null,
    });

    const req = { adminInfo: { id: "admin1", role: "ADMIN" } };

    await assert.rejects(
      () => service.listKycQueue(req),
      (err) => err instanceof ReadContractUnauthorizedError && err.statusCode === 401
    );

    assert.equal(repoCalled, false);
  });

  await t.test("inactive admin account throws ReadContractForbiddenError (403)", async () => {
    let repoCalled = false;
    const mockRepo = { findAdminPaginatedFleets: async () => { repoCalled = true; return { items: [], totalItems: 0 }; } };

    const service = createFleetReadService({
      repository: mockRepo,
      resolveAdminActor: async () => ({ status: "inactive", isLocked: false }),
    });

    const req = { adminInfo: { id: "admin1", role: "ADMIN" } };

    await assert.rejects(
      () => service.listFleetsForAdmin(req),
      (err) => err instanceof ReadContractForbiddenError && err.statusCode === 403
    );

    assert.equal(repoCalled, false);
  });

  await t.test("locked admin account throws ReadContractForbiddenError (403)", async () => {
    let repoCalled = false;
    const mockRepo = { findAdminFleetDetailById: async () => { repoCalled = true; } };

    const service = createFleetReadService({
      repository: mockRepo,
      resolveAdminActor: async () => ({ status: "active", isLocked: true }),
    });

    const req = { adminInfo: { id: "admin1", role: "ADMIN" }, params: { id: "507f1f77bcf86cd799439011" } };

    await assert.rejects(
      () => service.getFleetDetailForAdmin(req),
      (err) => err instanceof ReadContractForbiddenError && err.statusCode === 403
    );

    assert.equal(repoCalled, false);
  });
});
