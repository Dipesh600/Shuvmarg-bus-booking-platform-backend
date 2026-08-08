"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { mapFleetSetupStatus } = require("../../../src/modules/read-contracts/fleet/fleet-setup-status.dto");
const { createFleetReadService } = require("../../../src/modules/read-contracts/fleet/fleet-read.service");
const { createFleetSetupService } = require("../../../src/modules/admin/fleet-management/fleet-setup.service");

test("fleet setup status convergence unit tests", async (t) => {
  await t.test("canonical setup service calculates step truth from domain repositories", async () => {
    const mockRepo = {
      findFleet: async (id) => ({
        _id: id,
        busName: "Express Alpha",
        busNumber: "BA 1 PA 1234",
        approvalStatus: "APPROVED",
        corridorId: "corridor_100",
      }),
      findRouteConfigs: async () => [{ _id: "cfg_1" }],
      findAssignedDriver: async () => ({ _id: "drv_1", fullName: "Ram Bahadur" }),
      findSchedule: async () => ({ _id: "sch_1", status: "INACTIVE", returnScheduleId: "sch_2" }),
      findReturnSchedule: async () => ({ _id: "sch_2", status: "ACTIVE" }),
    };

    const getCanonicalSetupStatus = createFleetSetupService({ repository: mockRepo });
    const result = await getCanonicalSetupStatus("507f1f77bcf86cd799439011");

    assert.equal(result.statusCode, 200);
    const data = result.body.data;
    assert.equal(data.steps.routeAssigned, true);
    assert.equal(data.steps.routeConfigured, true);
    assert.equal(data.steps.driverAssigned, true);
    assert.equal(data.steps.scheduleCreated, true);
    assert.equal(data.steps.returnTripLinked, true);
    assert.equal(data.steps.activated, true);
    assert.equal(data.nextStep, "complete");
    assert.equal(data.isFullyOperational, true);
  });

  await t.test("mapFleetSetupStatus derives DTO percentage and steps cleanly from canonical output", () => {
    const canonicalData = {
      fleetId: "507f1f77bcf86cd799439011",
      busName: "Express Alpha",
      busNumber: "BA 1 PA 1234",
      approvalStatus: "APPROVED",
      steps: {
        routeAssigned: true,
        routeConfigured: true,
        driverAssigned: false,
        scheduleCreated: false,
        returnTripLinked: false,
        activated: false,
      },
      nextStep: "driverAssigned",
      isFullyOperational: false,
    };

    const dto = mapFleetSetupStatus(canonicalData);

    assert.equal(dto.fleetId, "507f1f77bcf86cd799439011");
    assert.equal(dto.setupComplete, false);
    assert.equal(dto.nextStep, "driverAssigned");
    assert.equal(dto.progress.completedSteps, 2);
    assert.equal(dto.progress.totalSteps, 6);
    assert.equal(dto.progress.percentage, 33);
    assert.equal(dto.blockingReasons.length, 4);
  });

  await t.test("fleet read service calls canonical setup service exactly once and bypasses raw repository method", async () => {
    let canonicalCallCount = 0;
    const mockCanonicalService = async (id) => {
      canonicalCallCount++;
      return {
        statusCode: 200,
        body: {
          success: true,
          data: {
            fleetId: id,
            busName: "City Liner",
            busNumber: "BA 2 PA 5678",
            approvalStatus: "APPROVED",
            steps: {
              routeAssigned: true,
              routeConfigured: true,
              driverAssigned: true,
              scheduleCreated: true,
              returnTripLinked: false,
              activated: false,
            },
            nextStep: "activated",
            isFullyOperational: false,
          },
        },
      };
    };

    const mockRepo = {}; // No findFleetSetupStatusDataById defined!

    const service = createFleetReadService({
      repository: mockRepo,
      getCanonicalSetupStatus: mockCanonicalService,
      resolveAdminActor: async () => ({ status: "active", isLocked: false }),
    });

    const req = {
      adminInfo: { id: "admin1", role: "ADMIN" },
      params: { id: "507f1f77bcf86cd799439011" },
    };

    const response = await service.getFleetSetupStatusForAdmin(req);

    assert.equal(canonicalCallCount, 1);
    assert.equal(response.success, true);
    assert.equal(response.data.fleetId, "507f1f77bcf86cd799439011");
    assert.equal(response.data.progress.completedSteps, 4);
    assert.equal(response.data.progress.totalSteps, 6);
    assert.equal(response.data.progress.percentage, 67);
    assert.equal(response.data.nextStep, "activated");
  });
});
