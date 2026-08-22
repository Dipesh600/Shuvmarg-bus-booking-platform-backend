"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createAdminFleetCreatedNotificationService } = require("../../src/modules/admin/fleet-management/admin-fleet-created-notification.service");

function completeFleet() {
  const document = { objectKey: "fleet/doc.pdf", uploadedAt: new Date() };
  return {
    _id: "64f000000000000000000010",
    ownerId: { _id: "64f000000000000000000001", name: "Owner", phone: "9841234567" },
    createdBy: "ADMIN",
    busName: "Shuvmarg Express",
    busNumber: "BA 1 KHA 1234",
    busType: "DELUXE",
    vehicleType: "BUS",
    totalSeats: 40,
    registrationYear: 2025,
    fleetDocuments: { fitnessCert: document, insurance: document, bluebook: document, routePermit: document },
    fleetImages: ["FRONT", "SIDE", "BACK", "INSIDE"].map((view) => ({ view, objectKey: `fleet/${view}.jpg`, uploadedAt: new Date() })),
  };
}

test("admin-created fleet notification is complete, retryable, and SUB_ADMIN authorized", async () => {
  const fleet = completeFleet();
  const updates = [];
  const Bus = {
    findById: () => ({ populate: async () => fleet }),
    findOneAndUpdate: async (_query, update) => {
      updates.push(update);
      return fleet;
    },
    updateOne: async (_query, update) => { updates.push(update); },
  };
  const adminId = "64f000000000000000000099";
  const service = createAdminFleetCreatedNotificationService({
    Bus,
    resolveAuthorizedAdminActor: async (actor) => {
      assert.equal(actor.tokenRole, "SUB_ADMIN");
      return { _id: adminId, role: "SUB_ADMIN" };
    },
    loadSeatLayout: async () => ({ assigned: true, published: true, totalPlaces: 40 }),
    env: { NODE_ENV: "production", OPERATOR_APP_URL: "https://operator-staging.shuvmarg.com" },
    notify: async (_fleet, loginUrl) => {
      assert.equal(loginUrl, "https://operator-staging.shuvmarg.com/login");
      return { smsDelivered: false };
    },
  });

  const result = await service.notifyCreatedFleet({
    fleetId: fleet._id,
    actor: { adminId, tokenRole: "SUB_ADMIN" },
  });

  assert.equal(result.status, "FAILED");
  assert.equal(updates[0].$set["adminCreationNotification.initiatedBy"], adminId);
  assert.equal(updates[1].$set["adminCreationNotification.status"], "FAILED");
});
