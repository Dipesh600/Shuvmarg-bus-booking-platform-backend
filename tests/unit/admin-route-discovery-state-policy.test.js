"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  VALID_TRANSITIONS,
  assertTransition,
} = require("../../src/modules/admin/route-discovery/route-discovery-state.policy.js");

test("route discovery state policy", async (t) => {
  const allowed = [
    ["DRAFT", "ROUTE_SELECTED"],
    ["DRAFT", "REJECTED"],
    ["ROUTE_SELECTED", "STOPS_DISCOVERED"],
    ["ROUTE_SELECTED", "DRAFT"],
    ["ROUTE_SELECTED", "REJECTED"],
    ["STOPS_DISCOVERED", "APPROVED"],
    ["STOPS_DISCOVERED", "ROUTE_SELECTED"],
    ["STOPS_DISCOVERED", "REJECTED"],
    ["APPROVED", "PUBLISHED"],
    ["APPROVED", "STOPS_DISCOVERED"],
    ["APPROVED", "REJECTED"],
  ];
  await t.test("allows every characterized transition", () => {
    for (const [current, next] of allowed) {
      assert.doesNotThrow(() => assertTransition(current, next));
    }
  });
  await t.test("terminal states reject all transitions", () => {
    for (const current of ["PUBLISHED", "REJECTED"]) {
      assert.deepEqual(VALID_TRANSITIONS[current], []);
      assert.throws(
        () => assertTransition(current, "DRAFT"),
        new RegExp(`Invalid status transition: ${current}`)
      );
    }
  });
  await t.test("unknown states fail with a domain error", () => {
    assert.throws(
      () => assertTransition("UNKNOWN", "DRAFT"),
      /Allowed from UNKNOWN: \[none\]/
    );
  });
});
