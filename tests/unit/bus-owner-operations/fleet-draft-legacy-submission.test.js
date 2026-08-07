"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { ApiError } = require("../../../src/contracts");
const { createBusOwnerFleetCommandService } = require("../../../src/modules/bus-owner/fleet-management/fleet-command.service");

test("20. Legacy submission endpoint compatibility behavior", async () => {
  let submissionCalled = false;
  const mockFleetService = {
    createFleet: async () => ({ _id: "f_legacy" }),
  };
  const mockSubmissionService = {
    submitFleetForVerification: async () => {
      submissionCalled = true;
      return { _id: "f_legacy", approvalStatus: "PENDING" };
    },
  };
  const cmdService = createBusOwnerFleetCommandService({
    fleetService: mockFleetService,
    submissionService: mockSubmissionService,
  });

  const result = await cmdService.submitFleetForOwner({
    userInfo: { id: "owner_123" },
    body: { busName: "Legacy Bus", busNumber: "BA 1 PA 9999", busType: "AC", vehicleType: "bus", totalSeats: 30 },
  });

  assert.equal(submissionCalled, true);
  assert.equal(result.data.fleet.approvalStatus, "PENDING");
});

test("29. Legacy unapproved full-payload submission creates no draft", async () => {
  let fleetRemoved = false;
  const mockFleetService = {
    createFleet: async () => ({ _id: "f_unapp" }),
    removeFleet: async () => (fleetRemoved = true),
  };
  const mockSubmissionService = {
    submitFleetForVerification: async () => {
      throw new ApiError("PROFILE_NOT_APPROVED", { message: "Not approved" });
    },
  };
  const cmdService = createBusOwnerFleetCommandService({
    fleetService: mockFleetService,
    submissionService: mockSubmissionService,
  });

  await assert.rejects(
    cmdService.submitFleetForOwner({
      userInfo: { id: "unapp_owner" },
      body: { busName: "Legacy", busNumber: "BA 1 PA 9999", busType: "AC", vehicleType: "bus", totalSeats: 30 },
    }),
    { code: "PROFILE_NOT_APPROVED", statusCode: 403 }
  );
  assert.equal(fleetRemoved, true);
});

test("30. Legacy approved full-payload readiness failure preserves draft ID and returns structured errors", async () => {
  const mockFleetService = {
    createFleet: async () => ({ _id: "f_draft_preserved" }),
  };
  const mockSubmissionService = {
    submitFleetForVerification: async () => {
      throw new ApiError("FLEET_SUBMISSION_INCOMPLETE", {
        details: { missingDocuments: ["bluebook"] },
      });
    },
  };
  const cmdService = createBusOwnerFleetCommandService({
    fleetService: mockFleetService,
    submissionService: mockSubmissionService,
  });

  await assert.rejects(
    cmdService.submitFleetForOwner({
      userInfo: { id: "owner_123" },
      body: { busName: "Legacy Incomplete", busNumber: "BA 1 PA 8888", busType: "AC", vehicleType: "bus", totalSeats: 30 },
    }),
    (err) => {
      assert.equal(err instanceof ApiError, true);
      assert.equal(err.code, "FLEET_SUBMISSION_INCOMPLETE");
      assert.equal(err.statusCode, 422);
      assert.equal(err.details?.fleetId, "f_draft_preserved");
      assert.deepEqual(err.details?.missingDocuments, ["bluebook"]);
      return true;
    }
  );
});
