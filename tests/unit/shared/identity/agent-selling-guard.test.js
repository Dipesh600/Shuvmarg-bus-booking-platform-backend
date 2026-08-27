"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const AgentAssignment = require("../../../../models/agentAssignmentModel");
const BusSchedule = require("../../../../models/busScheduleModel");
const { filterSellableSchedules } = require("../../../../src/shared/identity/agent-selling-guard");

const OWNER = "507f1f77bcf86cd799439011";
const BRAND_A = "507f1f77bcf86cd799439030";
const BRAND_B = "507f1f77bcf86cd799439031";

const assignment = (over = {}) => ({
  status: "ACTIVE",
  operatorId: BRAND_A,
  ownerId: OWNER,
  accessScope: "ALL_BUSES",
  allowedRouteIds: [],
  allowedScheduleIds: [],
  ...over,
});

const schedule = (id, brandId = BRAND_A, over = {}) => ({
  _id: id,
  routeId: `route-${id}`,
  busRouteId: `service-${id}`,
  isActive: true,
  busId: {
    _id: `bus-${id}`,
    brandId,
    ownerId: OWNER,
    approvalStatus: "APPROVED",
    status: "ACTIVE",
  },
  ...over,
});

test("shared agent selling guard", async (t) => {
  await t.test("narrowing ids reference the schedule fields they are compared against", () => {
    const refOf = (model, path) => {
      const schemaType = model.schema.path(path);
      return schemaType?.caster?.options?.ref || schemaType?.options?.ref;
    };
    assert.equal(
      refOf(AgentAssignment, "allowedRouteIds"),
      refOf(BusSchedule, "busRouteId"),
    );
    assert.equal(
      refOf(AgentAssignment, "allowedScheduleIds"),
      BusSchedule.modelName,
    );
  });

  await t.test("U1 same-owner sibling brand schedules are absent", () => {
    const brandA = schedule("a", BRAND_A);
    const brandB = schedule("b", BRAND_B);
    assert.deepEqual(
      filterSellableSchedules({ assignment: assignment(), schedules: [brandA, brandB] }),
      [brandA],
    );
  });

  await t.test("U2 ACTIVE is the only sellable assignment status", () => {
    for (const status of ["INVITED", "ACTIVE", "SUSPENDED", "REVOKED", "DECLINED", "EXPIRED"]) {
      const found = filterSellableSchedules({
        assignment: assignment({ status }), schedules: [schedule("one")],
      });
      assert.equal(found.length, status === "ACTIVE" ? 1 : 0, status);
    }
  });

  await t.test("U3 an allowed schedule id cannot grant another brand's inventory", () => {
    const foreign = schedule("foreign", BRAND_B);
    const found = filterSellableSchedules({
      assignment: assignment({ accessScope: "SCHEDULES", allowedScheduleIds: [foreign._id] }),
      schedules: [foreign],
    });
    assert.deepEqual(found, []);
  });

  await t.test("U4 narrowing scopes intersect and an empty list fails closed", () => {
    const first = schedule("first", BRAND_A, {
      routeId: "google-route-1", busRouteId: "service-1",
    });
    const second = schedule("second", BRAND_A, {
      routeId: "google-route-2", busRouteId: "service-2",
    });
    assert.deepEqual(filterSellableSchedules({
      assignment: assignment({ accessScope: "ROUTES", allowedRouteIds: ["service-2"] }),
      schedules: [first, second],
    }), [second]);
    assert.deepEqual(filterSellableSchedules({
      assignment: assignment({ accessScope: "ROUTES", allowedRouteIds: [] }),
      schedules: [first, second],
    }), []);
    assert.deepEqual(filterSellableSchedules({
      assignment: assignment({ accessScope: "SCHEDULES", allowedScheduleIds: [first._id] }),
      schedules: [first, second],
    }), [first]);
  });

  await t.test("U5 only approved, operational buses with active schedules survive", () => {
    const approved = schedule("approved");
    const candidates = [
      approved,
      schedule("draft", BRAND_A, { busId: { ...approved.busId, approvalStatus: "DRAFT" } }),
      schedule("pending", BRAND_A, { busId: { ...approved.busId, approvalStatus: "PENDING" } }),
      schedule("rejected", BRAND_A, { busId: { ...approved.busId, approvalStatus: "REJECTED" } }),
      schedule("inactive", BRAND_A, { busId: { ...approved.busId, status: "INACTIVE" } }),
      schedule("maintenance", BRAND_A, { busId: { ...approved.busId, status: "MAINTENANCE" } }),
      schedule("schedule-off", BRAND_A, { isActive: false }),
    ];
    assert.deepEqual(filterSellableSchedules({ assignment: assignment(), schedules: candidates }), [approved]);
  });
});
