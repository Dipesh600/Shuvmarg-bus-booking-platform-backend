"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createFleetReadRepository } = require("../../../src/modules/read-contracts/fleet/fleet-read.repository");
const { createAdminBusOwnerRepository } = require("../../../src/modules/read-contracts/admin-bus-owner/admin-bus-owner.repository");
const { createAdminKycRepository } = require("../../../src/modules/read-contracts/admin-kyc/admin-kyc.repository");
const { ReadContractValidationError } = require("../../../src/modules/read-contracts/common/read-errors");
const { buildAdminFleetFilter } = require("../../../src/modules/read-contracts/fleet/fleet-read-filter.builder");

test("read filter validation unit tests", async (t) => {
  await t.test("fleet repository rejects invalid status filter", async () => {
    const repo = createFleetReadRepository({ FleetModel: { find: () => ({ populate: () => ({ populate: () => ({ populate: () => ({ sort: () => ({ skip: () => ({ limit: () => ({ lean: async () => [] }) }) }) }) }) }) }), countDocuments: async () => 0 } });

    await assert.rejects(
      () => repo.findAdminPaginatedFleets({ status: "INVALID_STATUS" }),
      (err) => err instanceof ReadContractValidationError && err.code === "READ_INVALID_FILTER"
    );
  });

  await t.test("fleet repository rejects invalid approvalStatus filter", async () => {
    const repo = createFleetReadRepository({});

    await assert.rejects(
      () => repo.findAdminPaginatedFleets({ approvalStatus: "NOT_A_STATUS" }),
      (err) => err instanceof ReadContractValidationError && err.code === "READ_INVALID_FILTER"
    );
  });

  await t.test("fleet repository rejects invalid ownerId filter", async () => {
    const repo = createFleetReadRepository({});

    await assert.rejects(
      () => repo.findAdminPaginatedFleets({ ownerId: "not-an-object-id" }),
      (err) => err instanceof ReadContractValidationError && err.code === "READ_INVALID_FILTER"
    );
  });

  await t.test("fleet repository rejects oversized search string (> 100 chars)", async () => {
    const repo = createFleetReadRepository({});
    const longSearch = "a".repeat(101);

    await assert.rejects(
      () => repo.findAdminPaginatedFleets({ search: longSearch }),
      (err) => err instanceof ReadContractValidationError && err.code === "READ_INVALID_FILTER"
    );
  });

  await t.test("operational fleet filter selects approved, setup-complete fleets", () => {
    assert.deepEqual(buildAdminFleetFilter({ operational: "true" }, []), {
      approvalStatus: "APPROVED",
      setupComplete: true,
    });
  });

  await t.test("fleet filter accepts a valid brand scope", () => {
    const brandId = "507f1f77bcf86cd799439011";
    assert.deepEqual(buildAdminFleetFilter({ brandId }, []), { brandId });
  });

  await t.test("fleet filter rejects invalid operational and brand scopes", () => {
    assert.throws(
      () => buildAdminFleetFilter({ operational: "yes" }, []),
      (err) => err instanceof ReadContractValidationError && err.code === "READ_INVALID_FILTER"
    );
    assert.throws(
      () => buildAdminFleetFilter({ brandId: "not-an-object-id" }, []),
      (err) => err instanceof ReadContractValidationError && err.code === "READ_INVALID_FILTER"
    );
  });

  await t.test("bus owner repository rejects invalid verificationStatus filter", async () => {
    const repo = createAdminBusOwnerRepository({});

    await assert.rejects(
      () => repo.findPaginatedOwners({ verificationStatus: "INVALID_VERIF" }),
      (err) => err instanceof ReadContractValidationError && err.code === "READ_INVALID_FILTER"
    );
  });

  await t.test("KYC repository rejects invalid verificationStatus filter", async () => {
    const repo = createAdminKycRepository({});

    await assert.rejects(
      () => repo.findPaginatedKycs({ verificationStatus: "INVALID_KYC_VERIF" }),
      (err) => err instanceof ReadContractValidationError && err.code === "READ_INVALID_FILTER"
    );
  });
});
