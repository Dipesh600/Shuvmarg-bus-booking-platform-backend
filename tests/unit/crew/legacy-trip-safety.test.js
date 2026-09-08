"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { assertScheduleDriverEligible } = require("../../../src/modules/admin/schedule-management/schedule-driver-gate.service");
const { resolveDefaultDriver } = require("../../../src/shared/crew/default-driver.service");
const root = path.resolve(__dirname, "../../..");
const query = value => ({ select() { return this; }, populate() { return this; }, lean: async () => value,
  then: (resolve, reject) => Promise.resolve(value).then(resolve, reject) });
const validDriver = () => ({ _id: "new", brandId: "brand", approvalStatus: "APPROVED", status: "AVAILABLE",
  accessStatus: "ACTIVE",
  licenseNumber: "NL123", licenseType: "HV", licenseExpiry: "2099-01-01", licenseDoc: "license.pdf" });
function fixture(overrides = {}) {
  const state = { trip: { status: "boarding", driverId: "old", brandId: "brand", tripDate: "2026-09-03" },
    driver: validDriver(), writes: [], lookups: [], result: {}, ...overrides };
  const Trip = {
    findOne: () => query(state.trip), findById: () => query(state.trip),
    findOneAndUpdate: (filter, update, options) => { state.writes.push({ filter, update, options }); return query(state.result); },
  };
  const exported = { exports: {} };
  const servicePath = path.join(root, "services/tripService.js");
  vm.runInNewContext(fs.readFileSync(servicePath, "utf8"), {
    module: exported, exports: exported.exports, Date, console,
    require: name => {
      if (name === "../models/tripModel.js") return Trip;
      if (name === "../models/driverProfileModel.js") return { findById: id => { state.lookups.push(id); return query(state.driver); } };
      if (name === "../utils/logger.js") return { info() {} };
      if (name.startsWith("../src/shared/")) return require(path.resolve(root, "services", name));
      return {};
    },
  }, { filename: servicePath });
  return { state, service: exported.exports };
}
test("legacy trip update validates the new driver, not the previously assigned driver", async () => {
  const { state, service } = fixture();
  await service.updateTripDetails("trip", { driverId: "new", status: "in_transit" }, null, "admin");
  assert.deepEqual(state.lookups, ["new"]);
  assert.equal(state.writes[0].update.$set.status, "in-transit");
  assert.equal(state.writes[0].update.$push.driverAssignmentLog.assignedBy, "admin");
  assert.equal(state.writes[0].filter.status, "boarding");
  assert.equal(state.writes[0].options.runValidators, true);
});
test("direct driver edits cannot bypass eligibility", async () => {
  const { state, service } = fixture({ driver: { ...validDriver(), status: "INACTIVE" } });
  await assert.rejects(service.updateTripDetails("trip", { driverId: "new" }, null, "admin"), { statusCode: 400 });
  assert.equal(state.writes.length, 0);
});
test("legacy reassignment checks actor, terminal status and evidence", async () => {
  const { state, service } = fixture();
  await assert.rejects(service.assignDriver("trip", "new"), { statusCode: 403 });
  state.trip.status = "completed";
  await assert.rejects(service.assignDriver("trip", "new", "admin"), { statusCode: 400 });
  state.trip.status = "scheduled"; state.driver.licenseDoc = null;
  await assert.rejects(service.assignDriver("trip", "new", "admin"), { statusCode: 400 });
  assert.equal(state.writes.length, 0);
});
test("legacy status checks boarding and departure, but allows a trip to finish safely", async () => {
  const { state, service } = fixture({ driver: null });
  await assert.rejects(service.updateTripDetails("trip", { status: "in-transit" }), { statusCode: 400 });
  state.trip.status = "in-transit";
  await service.updateTripDetails("trip", { status: "completed" });
  assert.equal(state.writes.length, 1);
});
test("changing the trip date revalidates driver expiry", async () => {
  const { state, service } = fixture();
  await assert.rejects(service.updateTripDetails("trip", { tripDate: "2100-01-01" }), { statusCode: 400 });
  assert.equal(state.writes.length, 0);
});
test("legacy writes detect competing trip changes", async () => {
  const { service } = fixture({ result: null });
  await assert.rejects(service.assignDriver("trip", "new", "admin"), { statusCode: 409 });
});
test("Mongo operators and ownership changes cannot bypass the editable field gate", async () => {
  const { state, service } = fixture();
  await service.updateTripDetails("trip", { $set: { driverId: "bypass" }, brandId: "other", ownerId: "other", notes: "x" });
  assert.deepEqual(Object.keys(state.writes[0].update.$set), []);
});
test("schedule driver gate checks brand, status, documents and future expiry", async () => {
  let driver = validDriver(); const DriverModel = { findById: () => query(driver) };
  const schedule = { driverId: "new", brandId: "brand", effectiveFrom: "2098-01-01" };
  await assertScheduleDriverEligible(schedule, DriverModel);
  for (const overrides of [{ brandId: "other" }, { status: "SUSPENDED" }, { licenseDoc: null }, { licenseExpiry: "2097-01-01" }]) {
    driver = { ...validDriver(), ...overrides };
    await assert.rejects(assertScheduleDriverEligible(schedule, DriverModel), { statusCode: 400 });
  }
  await assertScheduleDriverEligible({ driverId: null }, { findById() { assert.fail("unassigned draft"); } });
});
test("generation never carries an ineligible default driver onto a future trip", async () => {
  let driver = validDriver();
  const deps = { DriverProfile: { findById: () => query(driver) }, logger: { warn() {} } };
  const input = { driverId: "new", brandId: "brand", tripDate: "2098-01-01" };
  assert.equal(await resolveDefaultDriver(input, deps), "new");
  driver.status = "SUSPENDED";
  assert.equal(await resolveDefaultDriver(input, deps), null);
  driver = null;
  assert.equal(await resolveDefaultDriver(input, deps), null);
});
