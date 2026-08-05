"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { mapFleetSetupStatus } = require("../../../src/modules/read-contracts/fleet/fleet-setup-status.dto");
const { createFleetReadService } = require("../../../src/modules/read-contracts/fleet/fleet-read.service");

test("fleet setup status DTO and service unit tests", async (t) => {
  await t.test("maps raw fleet persistence object with correct fleetId, fleetCode, and uppercase status", () => {
    const rawFleet = {
      _id: "507f1f77bcf86cd799439011",
      fleetId: "SUV-MARG-FLEET-ABC-001",
      isApproved: true,
      seatTemplateId: "template_123",
      route: { from: "Kathmandu", to: "Pokhara" },
      status: "ACTIVE",
      setupComplete: true,
    };

    const result = mapFleetSetupStatus(rawFleet);

    assert.equal(result.fleetId, "507f1f77bcf86cd799439011");
    assert.equal(result.fleetCode, "SUV-MARG-FLEET-ABC-001");
    assert.equal(result.setupComplete, true);
    assert.equal(result.progress.completedSteps, 4);
    assert.equal(result.progress.totalSteps, 4);
    assert.equal(result.progress.percentage, 100);
    assert.equal(result.steps.find((s) => s.key === "activation").complete, true);
  });

  await t.test("correctly flags incomplete steps when seat layout and route are missing", () => {
    const rawFleet = {
      _id: "507f1f77bcf86cd799439012",
      fleetId: "SUV-MARG-FLEET-ABC-002",
      isApproved: true,
      status: "INACTIVE",
    };

    const result = mapFleetSetupStatus(rawFleet);

    assert.equal(result.fleetId, "507f1f77bcf86cd799439012");
    assert.equal(result.fleetCode, "SUV-MARG-FLEET-ABC-002");
    assert.equal(result.setupComplete, false);
    assert.equal(result.progress.completedSteps, 1);
    assert.equal(result.steps.find((s) => s.key === "seat_layout").complete, false);
    assert.equal(result.steps.find((s) => s.key === "route_assignment").complete, false);
    assert.equal(result.steps.find((s) => s.key === "activation").complete, false);
  });

  await t.test("fleet read service delegates setup status query to raw repository data", async () => {
    let repoCalled = false;
    const mockRepo = {
      findFleetSetupStatusDataById: async (id) => {
        repoCalled = true;
        return {
          _id: id,
          fleetId: "SUV-MARG-FLEET-999",
          isApproved: true,
          seatTemplateId: "tmpl_1",
          route: { from: "KTM", to: "PKR" },
          status: "ACTIVE",
        };
      },
    };

    const service = createFleetReadService({
      repository: mockRepo,
      resolveAdminActor: async () => ({ status: "active", isLocked: false }),
    });

    const req = {
      adminInfo: { id: "admin1", role: "ADMIN" },
      params: { id: "507f1f77bcf86cd799439011" },
    };

    const response = await service.getFleetSetupStatusForAdmin(req);

    assert.equal(repoCalled, true);
    assert.equal(response.success, true);
    assert.equal(response.data.fleetId, "507f1f77bcf86cd799439011");
    assert.equal(response.data.fleetCode, "SUV-MARG-FLEET-999");
    assert.equal(response.data.progress.completedSteps, 4);
  });
});
