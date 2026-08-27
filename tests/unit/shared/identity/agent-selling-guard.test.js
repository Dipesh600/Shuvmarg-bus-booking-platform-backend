"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const AgentAssignment = require("../../../../models/agentAssignmentModel");
const Trip = require("../../../../models/tripModel");
const {
  SELLABLE_TRIP_STATUSES,
  filterSellableTrips,
} = require("../../../../src/shared/identity/agent-selling-guard");

const OWNER = "507f1f77bcf86cd799439011";
const BRAND_A = "507f1f77bcf86cd799439030";
const BRAND_B = "507f1f77bcf86cd799439031";
const NOW = new Date("2026-08-27T12:00:00.000Z");

const assignment = (over = {}) => ({
  status: "ACTIVE",
  operatorId: BRAND_A,
  ownerId: OWNER,
  accessScope: "ALL_BUSES",
  allowedRouteIds: [],
  allowedScheduleIds: [],
  ...over,
});

const trip = (id, brandId = BRAND_A, over = {}) => ({
  _id: id,
  brandId,
  ownerId: OWNER,
  routeId: `route-${id}`,
  scheduleId: `schedule-${id}`,
  status: "scheduled",
  tripDate: new Date("2026-08-28T00:00:00.000Z"),
  isActive: true,
  ...over,
});

const run = (row, trips) => filterSellableTrips({ assignment: row, trips, now: NOW });

test("shared agent Trip selling guard", async (t) => {
  await t.test("narrowing ids reference the Trip fields they are compared against", () => {
    const refOf = (model, path) => {
      const schemaType = model.schema.path(path);
      return schemaType?.caster?.options?.ref || schemaType?.options?.ref;
    };
    assert.equal(refOf(AgentAssignment, "allowedRouteIds"), refOf(Trip, "routeId"));
    assert.equal(refOf(AgentAssignment, "allowedScheduleIds"), refOf(Trip, "scheduleId"));
  });

  await t.test("W1 same-owner sibling brand Trips are absent", () => {
    const brandA = trip("a", BRAND_A);
    const brandB = trip("b", BRAND_B);
    assert.deepEqual(run(assignment(), [brandA, brandB]), [brandA]);
  });

  await t.test("W2 ACTIVE is the only sellable assignment status", () => {
    for (const status of ["INVITED", "ACTIVE", "SUSPENDED", "REVOKED", "DECLINED", "EXPIRED"]) {
      assert.equal(run(assignment({ status }), [trip("one")]).length, status === "ACTIVE" ? 1 : 0);
    }
  });

  await t.test("W3 narrowing never grants foreign-brand Trips and empty lists fail closed", () => {
    const foreign = trip("foreign", BRAND_B, { scheduleId: "granted" });
    assert.deepEqual(run(assignment({
      accessScope: "SCHEDULES", allowedScheduleIds: ["granted"],
    }), [foreign]), []);
    assert.deepEqual(run(assignment({
      accessScope: "SCHEDULES", allowedScheduleIds: [],
    }), [trip("local")]), []);
    assert.deepEqual(run(assignment({
      accessScope: "ROUTES", allowedRouteIds: [],
    }), [trip("local")]), []);
  });

  await t.test("W3 ROUTES and SCHEDULES compare matching Trip namespaces", () => {
    const first = trip("first", BRAND_A, { routeId: "route-1", scheduleId: "schedule-1" });
    const second = trip("second", BRAND_A, { routeId: "route-2", scheduleId: "schedule-2" });
    assert.deepEqual(run(assignment({
      accessScope: "ROUTES", allowedRouteIds: ["route-2"],
    }), [first, second]), [second]);
    assert.deepEqual(run(assignment({
      accessScope: "SCHEDULES", allowedScheduleIds: ["schedule-1"],
    }), [first, second]), [first]);
    assert.deepEqual(run(assignment({
      accessScope: "SCHEDULES", allowedScheduleIds: ["schedule-1"],
    }), [trip("manual", BRAND_A, { scheduleId: null })]), []);
  });

  await t.test("W4 real Trip enum keeps only upcoming scheduled and boarding Trips", () => {
    const realStatuses = Trip.schema.path("status").enumValues;
    assert.deepEqual(realStatuses, ["scheduled", "boarding", "in-transit", "completed", "cancelled"]);
    assert.deepEqual(SELLABLE_TRIP_STATUSES, ["scheduled", "boarding"]);
    for (const status of realStatuses) {
      const found = run(assignment(), [trip(status, BRAND_A, { status })]);
      assert.equal(found.length, SELLABLE_TRIP_STATUSES.includes(status) ? 1 : 0, status);
    }
    assert.deepEqual(run(assignment(), [
      trip("past", BRAND_A, { tripDate: new Date("2026-08-26T00:00:00.000Z") }),
      trip("inactive", BRAND_A, { isActive: false }),
    ]), []);
  });
});
