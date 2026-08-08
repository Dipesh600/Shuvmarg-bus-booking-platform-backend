"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createFleetUpdateService } = require("../../../src/modules/fleet-management/fleet-update.service");

function createMockFleet(overrides = {}) {
  return {
    _id: "507f1f77bcf86cd799439011",
    ownerId: "owner_123",
    busName: "Super Deluxe 101",
    busNumber: "BA 1 PA 1234",
    busType: "AC",
    vehicleType: "bus",
    totalSeats: 35,
    status: "INACTIVE",
    approvalStatus: "DRAFT",
    setupComplete: false,
    fleetDocuments: {},
    fleetImages: [],
    ...overrides,
  };
}

test("3. Pending owner can create and edit a DRAFT fleet", async () => {
  const fleet = createMockFleet({ approvalStatus: "DRAFT" });
  const repo = {
    findDocument: async (id, ownerId) => (id === fleet._id && ownerId === fleet.ownerId ? fleet : null),
  };
  let savedUpdate = null;
  const mockBusModel = {
    findOneAndUpdate: (query, update) => {
      savedUpdate = update.$set || update;
      return { lean: async () => ({ ...fleet, ...savedUpdate }) };
    },
    findByIdAndUpdate: (id, update) => {
      savedUpdate = update.$set || update;
      return { lean: async () => ({ ...fleet, ...savedUpdate }) };
    },
  };
  const mockPolicy = {
    restrictOwnerUpdate: (data) => { delete data.setupComplete; },
    lockApprovedIdentity: () => {},
    normalizeBusNumber: async () => {},
    verifySeatLayout: async () => {},
    parseCatalogAndReviews: () => {},
    validateUpdatableFields: () => {},
  };
  const updateService = createFleetUpdateService({
    Bus: mockBusModel,
    repository: repo,
    policy: mockPolicy,
    storage: {
      processOwnerUpdateAssets: async () => ({ changesCount: 0 }),
      replaceFleetImages: async () => ({ changesCount: 0 }),
    },
    mapper: { mapDetailsDto: (doc) => doc, withPresignedUrls: async (doc) => doc },
  });

  const updated = await updateService.updateFleetDetails(fleet._id, { busName: "Updated Name" }, {}, "owner_123");
  assert.equal(savedUpdate.busName, "Updated Name");
  assert.equal(updated.approvalStatus, "DRAFT");
});

test("23. setupComplete: true in owner update input is ignored", async () => {
  const fleet = createMockFleet({ approvalStatus: "DRAFT", setupComplete: false });
  let savedUpdate = null;
  const repo = { findDocument: async () => fleet };
  const mockBusModel = {
    findOneAndUpdate: (query, update) => {
      savedUpdate = update.$set || update;
      return { lean: async () => ({ ...fleet, ...savedUpdate }) };
    },
    findByIdAndUpdate: (id, update) => {
      savedUpdate = update.$set || update;
      return { lean: async () => ({ ...fleet, ...savedUpdate }) };
    },
  };
  const mockPolicy = {
    restrictOwnerUpdate: (data) => { delete data.setupComplete; },
    lockApprovedIdentity: () => {},
    normalizeBusNumber: async () => {},
    verifySeatLayout: async () => {},
    parseCatalogAndReviews: () => {},
    validateUpdatableFields: () => {},
  };
  const updateService = createFleetUpdateService({
    Bus: mockBusModel,
    repository: repo,
    policy: mockPolicy,
    storage: {
      processOwnerUpdateAssets: async () => ({ changesCount: 0 }),
      replaceFleetImages: async () => ({ changesCount: 0 }),
    },
    mapper: { mapDetailsDto: (doc) => doc, withPresignedUrls: async (doc) => doc },
  });

  await updateService.updateFleetDetails(fleet._id, { setupComplete: true, busName: "Updated" }, {}, "owner_123");
  assert.equal(savedUpdate.setupComplete, undefined);
});
