"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { mapFleetSetupStatus } = require("../../../src/modules/read-contracts/fleet/fleet-setup-status.dto");
const { createFleetSetupService } = require("../../../src/modules/admin/fleet-management/fleet-setup.service");

test("fleet setup status convergence unit tests", async (t) => {
  await t.test("canonical setup service calculates step truth from domain repositories", async () => {
    const mockRepo = {
      findFleet: async (id) => ({
        _id: id,
        brandId: "brand_100",
        busName: "Express Alpha",
        busNumber: "BA 1 PA 1234",
        approvalStatus: "APPROVED",
        setupComplete: true,
        corridorId: "corridor_100",
      }),
      findRouteConfigs: async () => [{
        _id: "cfg_1",
        status: "ACTIVE",
        activeStops: ["stop_1", "stop_2"],
      }],
      findAssignedDriver: async () => ({ _id: "drv_1", fullName: "Ram Bahadur" }),
      findSchedule: async () => ({ _id: "sch_1", status: "INACTIVE", returnScheduleId: "sch_2" }),
      findReturnSchedule: async () => ({ _id: "sch_2", status: "ACTIVE" }),
    };

    const getCanonicalSetupStatus = createFleetSetupService({ repository: mockRepo });
    const result = await getCanonicalSetupStatus("507f1f77bcf86cd799439011");

    assert.equal(result.statusCode, 200);
    const data = result.body.data;
    assert.equal(data.steps.routeAssigned, true);
    assert.equal(String(data.brandId), "brand_100");
    assert.equal(data.steps.routeConfigured, true);
    assert.equal(data.steps.driverAssigned, true);
    assert.equal(data.steps.scheduleCreated, true);
    assert.equal(data.steps.returnTripLinked, true);
    assert.equal(data.steps.activated, true);
    assert.equal(data.nextStep, "complete");
    assert.equal(data.isFullyOperational, true);
  });

  await t.test("draft route setup does not mark stops and timings complete", async () => {
    const mockRepo = {
      findFleet: async (id) => ({
        _id: id,
        brandId: "brand_100",
        busName: "Draft Route Bus",
        busNumber: "BA 1 PA 4321",
        approvalStatus: "APPROVED",
        setupComplete: false,
        corridorId: "corridor_100",
      }),
      findRouteConfigs: async () => [{
        _id: "cfg_draft",
        status: "DRAFT",
        activeStops: ["stop_1", "stop_2"],
      }],
      findAssignedDriver: async () => null,
      findSchedule: async () => null,
      findReturnSchedule: async () => null,
    };

    const getCanonicalSetupStatus = createFleetSetupService({ repository: mockRepo });
    const result = await getCanonicalSetupStatus("507f1f77bcf86cd799439011");

    assert.equal(result.statusCode, 200);
    const data = result.body.data;
    assert.equal(data.steps.routeAssigned, true);
    assert.equal(data.steps.routeConfigured, false);
    assert.equal(data.nextStep, "routeConfigured");
    assert.equal(data.isFullyOperational, false);
  });

  await t.test("mapFleetSetupStatus derives DTO percentage and steps cleanly from canonical output", () => {
    const canonicalData = {
      fleetId: "507f1f77bcf86cd799439011",
      brandId: "507f1f77bcf86cd799439099",
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
      assignedCorridor: {
        _id: "507f1f77bcf86cd799439022",
        code: "KTM-PKR",
        originId: { name: "Kathmandu" },
        destinationId: { name: "Pokhara" },
      },
    };

    const dto = mapFleetSetupStatus(canonicalData);

    assert.equal(dto.fleetId, "507f1f77bcf86cd799439011");
    assert.equal(dto.brandId, "507f1f77bcf86cd799439099");
    assert.equal(dto.setupComplete, false);
    assert.equal(dto.nextStep, "driverAssigned");
    assert.equal(dto.progress.completedSteps, 2);
    assert.equal(dto.progress.totalSteps, 5);
    assert.equal(dto.progress.percentage, 40);
    assert.equal(dto.blockingReasons.length, 3);
    assert.equal(dto.assignedRoute.corridorId, "507f1f77bcf86cd799439022");
    assert.equal(dto.assignedRoute.code, "KTM-PKR");
    assert.equal(dto.assignedRoute.origin, "Kathmandu");
    assert.equal(dto.assignedRoute.destination, "Pokhara");
    assert.equal(dto.assignedRoute.label, "Kathmandu to Pokhara");
  });

});
