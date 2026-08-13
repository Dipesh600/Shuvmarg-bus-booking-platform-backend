"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createFleetSeatLayoutService } = require("../../src/modules/seat-layout-v3-persistence/fleet-seat-layout.service");

const owner = { id: "owner-1", type: "BUS_OWNER" };
const admin = { id: "admin-1", type: "SUPER_ADMIN" };

function repository() {
  return {
    findFleet: async () => ({ _id: "fleet-1", ownerId: "owner-1" }),
    findRevision: async (id) => ({ _id: id, templateId: "template-1", status: "PUBLISHED" }),
    findTemplate: async () => ({ _id: "template-1", scope: "OPERATOR", ownerId: "owner-1", status: "ACTIVE" }),
    createInitialAssignment: async (input) => input,
    findAssignment: async () => ({ _id: "assignment-1", activeRevisionId: "rev-1" }),
    createChangeRequest: async (input) => input,
    approveChangeRequest: async (id, actor) => ({ id, actor }),
  };
}

const validLayout = {
  schemaVersion: 3, vehicleCategory: "BUS", sections: [{
    sectionId: "lower", name: "Passenger cabin", role: "LOWER_CABIN", order: 0,
    widthUnits: 3, heightUnits: 3, elements: [{
      elementId: "S-1", kind: "SEAT", label: "S1", position: { x: 0, y: 0 },
      size: { width: 1, height: 1 },
      attributes: { comfort: "STANDARD", commercialClass: "STANDARD", accessible: false },
    }],
  }],
};

test("owner cannot assign a layout to another owner's fleet", async () => {
  const repo = repository();
  repo.findFleet = async () => ({ _id: "fleet-1", ownerId: "owner-2" });
  await assert.rejects(
    createFleetSeatLayoutService(repo).assignInitial("fleet-1", "rev-1", owner),
    (error) => error.code === "FLEET_LAYOUT_FORBIDDEN"
  );
});

test("operator template cannot leak across owners", async () => {
  const repo = repository();
  repo.findTemplate = async () => ({ scope: "OPERATOR", ownerId: "owner-2", status: "ACTIVE" });
  await assert.rejects(
    createFleetSeatLayoutService(repo).assignInitial("fleet-1", "rev-1", owner),
    (error) => error.code === "SEAT_LAYOUT_TEMPLATE_OWNER_MISMATCH"
  );
});

test("platform template must be adopted before fleet assignment", async () => {
  const repo = repository();
  repo.findTemplate = async () => ({ scope: "PLATFORM", ownerId: null, status: "ACTIVE" });
  await assert.rejects(
    createFleetSeatLayoutService(repo).assignInitial("fleet-1", "rev-1", owner),
    (error) => error.code === "FLEET_LAYOUT_OPERATOR_TEMPLATE_REQUIRED"
  );
});

test("draft revisions cannot be assigned", async () => {
  const repo = repository();
  repo.findRevision = async () => ({ _id: "rev-1", status: "DRAFT" });
  await assert.rejects(
    createFleetSeatLayoutService(repo).assignInitial("fleet-1", "rev-1", owner),
    (error) => error.code === "SEAT_LAYOUT_REVISION_NOT_PUBLISHED"
  );
});

test("owner can create a private custom initial layout only for a draft fleet", async () => {
  const repo = repository();
  repo.findFleet = async () => ({ _id: "fleet-1", ownerId: "owner-1", approvalStatus: "DRAFT" });
  repo.findAssignment = async () => null;
  repo.createInitialCustomLayout = async (input) => input;
  const result = await createFleetSeatLayoutService(repo).createInitialCustomLayout(
    "fleet-1", { name: "Himalayan custom layout", layout: validLayout }, owner
  );
  assert.equal(result.name, "Himalayan custom layout");
  assert.equal(result.totalPlaces, 1);
  assert.equal(result.fleet._id, "fleet-1");
});

test("custom initial layout cannot bypass a live fleet lifecycle", async () => {
  const repo = repository();
  repo.findFleet = async () => ({ _id: "fleet-1", ownerId: "owner-1", approvalStatus: "APPROVED" });
  await assert.rejects(
    createFleetSeatLayoutService(repo).createInitialCustomLayout(
      "fleet-1", { name: "Unsafe replacement", layout: validLayout }, owner
    ),
    (error) => error.code === "FLEET_LAYOUT_INITIAL_LOCKED"
  );
});

test("layout change creates review request without mutating assignment", async () => {
  const repo = repository();
  const result = await createFleetSeatLayoutService(repo).requestChange("fleet-1", "rev-2", owner);
  assert.equal(result.assignment.activeRevisionId, "rev-1");
  assert.equal(result.revision._id, "rev-2");
});

test("requesting the already active revision is rejected", async () => {
  const repo = repository();
  await assert.rejects(
    createFleetSeatLayoutService(repo).requestChange("fleet-1", "rev-1", owner),
    (error) => error.code === "FLEET_LAYOUT_ALREADY_ACTIVE"
  );
});

test("only admin approval can activate a requested layout", async () => {
  const service = createFleetSeatLayoutService(repository());
  await assert.rejects(
    service.approveChange("request-1", owner),
    (error) => error.code === "FLEET_LAYOUT_REVIEW_FORBIDDEN"
  );
  assert.equal((await service.approveChange("request-1", admin)).id, "request-1");
});
