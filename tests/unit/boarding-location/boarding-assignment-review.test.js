"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Assignment = require("../../../models/operatorBoardingAssignmentModel.js");
const service = require(
  "../../../src/modules/admin/platform-registry/boarding-location/boarding-assignment-review.service.js"
);

function patch(t, object, key, replacement) {
  const original = object[key];
  object[key] = replacement;
  t.after(() => { object[key] = original; });
}

function populatedAssignment(overrides = {}) {
  return {
    _id: "507f1f77bcf86cd799439014", status: "PENDING_REVIEW",
    usage: "BOTH", brandId: {
      _id: "brand-1", brandName: "ABC", brandCode: "ABC", status: "ACTIVE",
    },
    boardingLocationId: {
      _id: "location-1", name: "Kalanki Chowk",
      status: "ACTIVE", verificationStatus: "VERIFIED",
    },
    populate() { return this; }, async save() {}, ...overrides,
  };
}

test("admin approves only a verified location for an active brand", async (t) => {
  const assignment = populatedAssignment();
  const query = { populate() { return this; }, then(resolve) { resolve(assignment); } };
  patch(t, Assignment, "findById", () => query);
  const result = await service.reviewBoardingAssignment(
    "507f1f77bcf86cd799439014", { status: "ACTIVE" }, "admin-1"
  );
  assert.equal(assignment.status, "ACTIVE");
  assert.equal(assignment.reviewedBy, "admin-1");
  assert.equal(result.brand.name, "ABC");
});

test("admin cannot approve an unverified requested location", async (t) => {
  const assignment = populatedAssignment({
    boardingLocationId: {
      _id: "location-1", name: "New point",
      status: "ACTIVE", verificationStatus: "PENDING",
    },
  });
  const query = { populate() { return this; }, then(resolve) { resolve(assignment); } };
  patch(t, Assignment, "findById", () => query);
  await assert.rejects(
    service.reviewBoardingAssignment(
      "507f1f77bcf86cd799439014", { status: "ACTIVE" }, "admin-1"
    ),
    { code: "BOARDING_ASSIGNMENT_NOT_APPROVABLE" }
  );
});
