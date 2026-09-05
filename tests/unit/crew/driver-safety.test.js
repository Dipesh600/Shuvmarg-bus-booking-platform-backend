"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { assertDriverEligible, assertDriverCompliance, assertAssignableTrip } = require("../../../src/shared/crew/driver-eligibility.policy");
const { canTransition } = require("../../../src/shared/crew/trip-status.policy");
const { createDriverAssignmentService } = require("../../../src/modules/admin/fleet-workstation/driver-assignment.service");
const { createTripStatusService } = require("../../../src/modules/admin/fleet-workstation/trip-status.service");
const now = new Date("2026-09-03T12:00:00Z");
const valid = () => ({ _id: "driver", brandId: "brand", status: "AVAILABLE", approvalStatus: "APPROVED",
  accessStatus: "ACTIVE",
  licenseNumber: "NL123", licenseType: "HV", licenseExpiry: "2026-09-03", licenseDoc: "license.pdf" });
const options = { brandId: "brand", now };

for (const status of ["AVAILABLE", "ON_DUTY", "OFF_DUTY"]) {
  test(`valid ${status} driver remains eligible through expiry day in Nepal`, () => {
    assert.doesNotThrow(() => assertDriverEligible({ ...valid(), status }, options));
  });
}
for (const [label, overrides] of [
  ["wrong brand", { brandId: "other" }], ["pending", { approvalStatus: "PENDING" }],
  ["invited account", { accessStatus: "INVITED" }], ["suspended access", { accessStatus: "SUSPENDED" }],
  ["rejected", { approvalStatus: "REJECTED" }], ["suspended", { status: "SUSPENDED" }],
  ["inactive", { status: "INACTIVE" }], ["removed", { removedAt: now }],
  ["expired license", { licenseExpiry: "2026-09-02" }], ["invalid license date", { licenseExpiry: "bad" }],
  ["missing license date", { licenseExpiry: null }], ["missing evidence", { licenseDoc: null }],
  ["missing license number", { licenseNumber: "" }], ["invalid license type", { licenseType: "BIKE" }],
  ["expired medical", { medicalCertDoc: "medical.pdf", medicalCertExpiry: "2026-09-02" }],
  ["medical evidence without expiry", { medicalCertDoc: "medical.pdf" }],
  ["medical expiry without evidence", { medicalCertExpiry: "2027-01-01" }],
]) {
  test(`rejects ${label} before assigning or operating`, () => {
    assert.throws(() => assertDriverEligible({ ...valid(), ...overrides }, options), { statusCode: 400 });
  });
}
test("future operations check future validity and old trip dates cannot bypass current expiry", () => {
  assert.throws(() => assertDriverEligible(valid(), { ...options, at: "2026-09-04" }));
  assert.throws(() => assertDriverEligible({ ...valid(), licenseExpiry: "2026-09-02" }, { ...options, at: "2025-01-01" }));
  assert.throws(() => assertDriverEligible(valid(), { ...options, at: "bad" }));
});
test("Nepal calendar boundary is used instead of UTC midnight", () => {
  assert.throws(() => assertDriverCompliance(valid(), { at: new Date("2026-09-03T18:15:00Z") }));
  assert.doesNotThrow(() => assertDriverCompliance(valid(), { at: new Date("2026-09-03T18:14:59Z") }));
});
test("structured document evidence works for legacy records", () => {
  assert.doesNotThrow(() => assertDriverEligible({ ...valid(), licenseDoc: null,
    documents: { license: { url: "legacy.pdf" } } }, options));
});
for (const status of ["completed", "cancelled", "unknown"]) {
  test(`terminal/invalid ${status} trip rejects reassignment`, () => assert.throws(() => assertAssignableTrip({ status })));
}
test("both legacy and canonical in-transit spellings share one lifecycle", () => {
  assert.equal(canTransition("boarding", "in_transit"), true);
  assert.equal(canTransition("boarding", "in-transit"), true);
  assert.equal(canTransition("in_transit", "completed"), true);
  assert.equal(canTransition("in-transit", "boarding"), false);
});
test("workstation rejection does not mutate assignment or audit history", async () => {
  const trip = { status: "boarding", brandId: "brand", driverId: "old", driverAssignmentLog: [], save() { assert.fail("must not save"); } };
  const service = createDriverAssignmentService({ Trip: { findOne: async () => trip },
    DriverProfile: { findOne: async () => ({ ...valid(), status: "SUSPENDED" }) }, clock: () => now });
  await assert.rejects(service.reassign({ driverId: "driver" }), { statusCode: 400 });
  assert.equal(trip.driverId, "old"); assert.deepEqual(trip.driverAssignmentLog, []);
});
for (const nextStatus of ["boarding", "in-transit", "in_transit"]) {
  test(`workstation rechecks driver before ${nextStatus}`, async () => {
    const trip = { status: nextStatus === "boarding" ? "scheduled" : "boarding", driverId: "driver", brandId: "brand",
      save() { assert.fail("must not save"); } };
    const service = createTripStatusService({ Trip: { findOne: async () => trip },
      DriverProfile: { findById: async () => ({ ...valid(), approvalStatus: "REJECTED" }) },
      transitionPolicy: { canTransition }, clock: () => now });
    await assert.rejects(service.updateStatus({ status: nextStatus }), { statusCode: 400 });
  });
}
test("workstation writes canonical departure status after validating driver", async () => {
  let saves = 0;
  const trip = { status: "boarding", driverId: "driver", brandId: "brand", save: async () => saves++ };
  const service = createTripStatusService({ Trip: { findOne: async () => trip },
    DriverProfile: { findById: async () => valid() }, transitionPolicy: { canTransition }, clock: () => now });
  await service.updateStatus({ status: "in_transit" });
  assert.equal(trip.status, "in-transit"); assert.equal(saves, 1); assert.equal(trip.actualDepartureTime, now);
});
