"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createFleetUpdateService } = require("../../../src/modules/fleet-management/fleet-update.service");

test("generic admin updates cannot modify a fleet while its submission is under review", async () => {
  const service = createFleetUpdateService({
    Bus: {}, policy: {},
    repository: { findDocument: async () => ({ _id: "f", approvalStatus: "PENDING" }) },
    storage: {}, mapper: {},
  });
  await assert.rejects(
    service.updateFleetDetails("f", { busName: "Changed during review" }, {}, null),
    (error) => error.code === "FLEET_MUTATION_LOCKED" && error.statusCode === 409
  );
});

test("admin fleet updates validate a replacement brand against the fleet owner", async () => {
  const events = [];
  const policy = {
    rejectLifecycleUpdate: () => events.push("lifecycle"),
    restrictAdminUpdate: () => events.push("restrict-admin"),
    lockApprovedIdentity: () => events.push("lock"),
    validateIdentityUpdate: () => events.push("identity"),
    normalizeBusNumber: async () => events.push("number"),
    verifySeatLayout: async () => events.push("layout"),
    parseCatalogAndReviews: () => events.push("parse"),
  };
  const service = createFleetUpdateService({
    Bus: { findByIdAndUpdate: () => ({ lean: async () => ({}) }) }, policy,
    repository: { findDocument: async () => ({ _id: "f", ownerId: "owner-1", approvalStatus: "DRAFT" }) },
    storage: { replaceFleetImages: async () => null },
    mapper: { withPresignedUrls: async (fleet) => fleet },
    validateBrand: async (brandId, ownerId) => events.push(`brand:${brandId}:${ownerId}`),
  });
  await service.updateFleetDetails("f", { brandId: "brand-1" }, {}, null);
  assert.deepEqual(events.slice(0, 5), [
    "lifecycle", "restrict-admin", "lock", "identity", "brand:brand-1:owner-1",
  ]);
});
