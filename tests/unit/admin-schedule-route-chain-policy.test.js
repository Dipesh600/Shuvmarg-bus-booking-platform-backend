"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  assertScheduleRouteChainReady,
} = require("../../src/modules/admin/schedule-management/schedule-route-chain.policy.js");

function lean(value) {
  return {
    select() { return this; },
    lean: async () => value,
  };
}

const baseSchedule = {
  _id: "schedule-1",
  busId: "fleet-1",
  variantId: "variant-1",
  operatorRouteConfigId: "config-1",
};

function deps(overrides = {}) {
  return {
    FleetModel: {
      findById: () => lean({
        _id: "fleet-1",
        approvalStatus: "APPROVED",
        status: "ACTIVE",
        busNumber: "BA 1 KHA 1234",
      }),
    },
    OperatorRouteConfigModel: {
      findById: () => lean({
        _id: "config-1",
        variantId: "variant-1",
        status: "ACTIVE",
      }),
    },
    RouteStopModel: { countDocuments: async () => 2 },
    RouteVariantModel: {
      findById: () => lean({
        _id: "variant-1",
        status: "ACTIVE",
        returnVariantId: null,
      }),
    },
    ...overrides,
  };
}

test("schedule route chain accepts active variant, config, sequence, and fleet", async () => {
  const result = await assertScheduleRouteChainReady(baseSchedule, deps());
  assert.equal(result.routeStopCount, 2);
  assert.equal(result.variant.status, "ACTIVE");
});

test("schedule route chain rejects inactive variants before operations continue", async () => {
  await assert.rejects(
    assertScheduleRouteChainReady(baseSchedule, deps({
      RouteVariantModel: {
        findById: () => lean({ _id: "variant-1", status: "INACTIVE" }),
      },
    })),
    (error) => error.code === "SCHEDULE_VARIANT_NOT_ACTIVE"
  );
});

test("schedule route chain rejects mismatched or inactive operator configs", async () => {
  await assert.rejects(
    assertScheduleRouteChainReady(baseSchedule, deps({
      OperatorRouteConfigModel: {
        findById: () => lean({
          _id: "config-1",
          variantId: "other-variant",
          status: "ACTIVE",
        }),
      },
    })),
    (error) => error.code === "SCHEDULE_ROUTE_PATTERN_MISMATCH"
  );

  await assert.rejects(
    assertScheduleRouteChainReady(baseSchedule, deps({
      OperatorRouteConfigModel: {
        findById: () => lean({
          _id: "config-1",
          variantId: "variant-1",
          status: "INACTIVE",
        }),
      },
    })),
    (error) => error.code === "SCHEDULE_ROUTE_PATTERN_NOT_ACTIVE"
  );
});

test("schedule route chain rejects incomplete sequences and inactive fleets", async () => {
  await assert.rejects(
    assertScheduleRouteChainReady(baseSchedule, deps({
      RouteStopModel: { countDocuments: async () => 1 },
    })),
    (error) => error.code === "SCHEDULE_VARIANT_SEQUENCE_INCOMPLETE"
  );

  await assert.rejects(
    assertScheduleRouteChainReady(baseSchedule, deps({
      FleetModel: {
        findById: () => lean({
          _id: "fleet-1",
          approvalStatus: "APPROVED",
          status: "INACTIVE",
        }),
      },
    })),
    (error) => error.code === "SCHEDULE_FLEET_NOT_OPERATIONAL"
  );
});
