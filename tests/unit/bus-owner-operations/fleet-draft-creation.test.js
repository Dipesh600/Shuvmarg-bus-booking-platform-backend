"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { createFleetCreationService } = require("../../../src/modules/fleet-management/fleet-creation.service");

function createMockBusInstance(data) {
  const instance = { ...data, _id: "f_created", fleetImages: [], fleetDocuments: {} };
  instance.save = async () => instance;
  instance.toObject = () => instance;
  return instance;
}

test("1. Fleet creation produces DRAFT, not PENDING", async () => {
  let createdPayload = null;
  const mockBus = function (data) {
    createdPayload = data;
    this.save = async () => createMockBusInstance(data);
  };
  mockBus.findByIdAndDelete = () => ({ catch: () => {} });
  const creationService = createFleetCreationService({
    Bus: mockBus,
    RouteRequest: class {},
    policy: { validateReferences: async () => {}, validateBrand: async () => {} },
    storage: { uploadCreationAssets: async () => ({ fleetImages: [], fleetDocuments: {} }) },
  });

  await creationService.createFleet("owner_123", {
    busName: "Test Bus",
    busNumber: "BA 2 PA 9999",
    busType: "AC",
    vehicleType: "bus",
    totalSeats: 30,
    approvalStatus: "APPROVED",
  });

  assert.equal(createdPayload.approvalStatus, "DRAFT");
  assert.equal(createdPayload.status, "INACTIVE");
  assert.equal(createdPayload.isApproved, false);
});

test("2. DRAFT fleet does not appear in pending admin review queue", () => {
  const { buildFleetQuery } = require("../../../src/modules/admin/fleet-management/fleet-query.policy");
  const pendingQuery = buildFleetQuery({ approvalStatus: "PENDING" });
  assert.equal(pendingQuery.approvalStatus, "PENDING");
  assert.notEqual(pendingQuery.approvalStatus, "DRAFT");
});

test("21. Caller cannot create a fleet directly as PENDING, APPROVED, or REJECTED", async () => {
  let createdData = null;
  const mockBus = function (data) {
    createdData = data;
    this.save = async () => createMockBusInstance(data);
  };
  mockBus.findByIdAndDelete = () => ({ catch: () => {} });
  const creationService = createFleetCreationService({
    Bus: mockBus,
    RouteRequest: class {},
    policy: { validateReferences: async () => {}, validateBrand: async () => {} },
    storage: { uploadCreationAssets: async () => ({ fleetImages: [], fleetDocuments: {} }) },
  });

  for (const attemptedStatus of ["PENDING", "APPROVED", "REJECTED"]) {
    await creationService.createFleet("owner_123", {
      busName: "Forced Status Bus",
      busNumber: `BA 1 PA ${Math.floor(Math.random() * 9000 + 1000)}`,
      busType: "AC",
      vehicleType: "bus",
      totalSeats: 30,
      approvalStatus: attemptedStatus,
    });
    assert.equal(createdData.approvalStatus, "DRAFT");
  }
});

test("35. Direct model instantiation rejects non-DRAFT approvalStatus", async () => {
  require("../../../models/busOwnerModel");
  const Bus = require("../../../models/fleetModel");
  const busInstance = new Bus({
    ownerId: new mongoose.Types.ObjectId(),
    busName: "Direct Bus",
    busNumber: "BA 9 PA 0000",
    busType: "AC",
    vehicleType: "bus",
    totalSeats: 30,
    approvalStatus: "PENDING",
  });

  const BusOwner = mongoose.model("BusOwner");
  const originalFindOne = BusOwner.findOne;
  BusOwner.findOne = () => ({
    select: () => ({
      lean: async () => ({ verificationStatus: "approved" }),
    }),
  });

  try {
    await assert.rejects(
      busInstance.save(),
      (err) => err.message.includes("OWNER_NOT_APPROVED") && err.message.includes("DRAFT")
    );
  } finally {
    BusOwner.findOne = originalFindOne;
  }
});
