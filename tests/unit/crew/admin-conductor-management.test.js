"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createAdminConductorController } = require("../../../src/modules/admin/conductor-management/conductor.controller");

const adminId = "650000000000000000000001", ownerId = "650000000000000000000002";
const brandId = "650000000000000000000003", profileId = "650000000000000000000004";
const userId = "650000000000000000000005";
const response = () => ({ code: 0, status(code) { this.code = code; return this; },
  json(body) { this.body = body; return this; } });
const query = value => ({ populate() { return this; }, sort() { return this; }, skip() { return this; },
  limit() { return this; }, lean: async () => value });
const makeDoc = overrides => ({
  _id: profileId, brandId, ownerId, userId, fullName: "Staff Person", phone: "9800000001",
  status: "AVAILABLE", assignedTripIds: [], statusHistory: [], removedAt: null, notes: null,
  accessStatus: "ACTIVE", invitationDeliveryStatus: "NOT_REQUIRED",
  async save() {}, toObject() { return { ...this }; }, ...overrides,
});
function fixture({ profiles = [], document = null, brand = { _id: brandId, ownerId, status: "ACTIVE" }, assignment } = {}) {
  const state = { filters: [], assignment: null };
  const ConductorProfile = {
    find(filter) { state.filters.push(filter); return query(profiles); },
    countDocuments: async () => profiles.length,
    findById() { return document && typeof document.save === "function" ? document : query(document); },
  };
  const controller = createAdminConductorController({ ConductorProfile,
    OperatorBrand: { findById() { return query(brand); } },
    assignmentService: { async assign(input) { state.assignment = input; return assignment || {
      alreadyAssigned: false, notificationStatus: "QUEUED", profileId, userId,
    }; } }, logger: { error() {} } });
  return { controller, state };
}

test("admin conductor directory is brand scoped and allowlisted", async () => {
  const privateTrip = { _id: "trip", tripId: "T-1", tripDate: "2026-09-04", departureTime: "08:00",
    status: "scheduled", bookings: ["private"], busId: { _id: "bus", busName: "Express", busNumber: "BA-1" } };
  const { controller, state } = fixture({ profiles: [{ ...makeDoc(), userId: { _id: userId,
    status: "invited", phoneVerified: false }, accessStatus: "INVITED",
    invitationDeliveryStatus: "QUEUED", assignedTripIds: [privateTrip], password: "private" }] });
  const res = response();
  await controller.getConductorsByBrand({ adminInfo: { id: adminId }, params: { brandId },
    query: { status: "AVAILABLE" } }, res);
  assert.equal(res.code, 200);
  assert.deepEqual(state.filters[0], { brandId, status: "AVAILABLE" });
  assert.equal(res.body.data[0].accessStatus, "INVITED");
  assert.equal(res.body.data[0].invitationDeliveryStatus, "QUEUED");
  assert.equal(res.body.data[0].assignedTrips[0].bus.busNumber, "BA-1");
  assert.equal("password" in res.body.data[0], false);
  assert.equal("bookings" in res.body.data[0].assignedTrips[0], false);
});

test("admin creation resolves brand ownership and records admin source", async () => {
  const { controller, state } = fixture(); const res = response();
  const body = { brandId, name: "Staff Person", phone: "9800000001" };
  await controller.createConductor({ adminInfo: { id: adminId }, body }, res);
  assert.equal(res.code, 201);
  assert.deepEqual(state.assignment, { ownerId, role: "conductor", input: body,
    source: "ADMIN", adminId });
  assert.match(res.body.message, /SMS invitation queued/);
});

test("admin edit cannot silently change a linked account phone", async () => {
  const document = makeDoc(); const { controller } = fixture({ document }); const res = response();
  await controller.updateConductor({ adminInfo: { id: adminId }, params: { id: profileId },
    body: { phone: "9800000002" } }, res);
  assert.equal(res.code, 409); assert.equal(document.phone, "9800000001");
});

test("admin suspension requires reason and records immutable audit context", async () => {
  const document = makeDoc(); const { controller } = fixture({ document }); const missing = response();
  await controller.updateConductorStatus({ adminInfo: { id: adminId }, params: { id: profileId },
    body: { status: "SUSPENDED" } }, missing);
  assert.equal(missing.code, 400);
  const res = response();
  await controller.updateConductorStatus({ adminInfo: { id: adminId }, params: { id: profileId },
    body: { status: "SUSPENDED", reason: "Safety investigation" } }, res);
  assert.equal(res.code, 200); assert.equal(document.status, "SUSPENDED");
  assert.equal(document.accessStatus, "SUSPENDED");
  assert.equal(document.accessStatusBeforeSuspension, "ACTIVE");
  assert.equal(document.suspensionReason, "Safety investigation");
  assert.deepEqual(document.statusHistory[0].from, "AVAILABLE");
  assert.deepEqual(document.statusHistory[0].actorId, adminId);
});

test("admin cannot clear an on-trip or operator-removed lifecycle state", async () => {
  for (const document of [makeDoc({ status: "ON_DUTY" }), makeDoc({ status: "INACTIVE", removedAt: new Date() })]) {
    const { controller } = fixture({ document }); const res = response();
    await controller.updateConductorStatus({ adminInfo: { id: adminId }, params: { id: profileId },
      body: { status: "AVAILABLE" } }, res);
    assert.equal(res.code, 409);
  }
});

test("ordinary duty updates do not silently activate an unlinked registry profile", async () => {
  const document = makeDoc({ accessStatus: "NOT_LINKED", status: "OFF_DUTY" });
  const { controller } = fixture({ document }); const res = response();
  await controller.updateConductorStatus({ adminInfo: { id: adminId }, params: { id: profileId },
    body: { status: "AVAILABLE" } }, res);
  assert.equal(res.code, 200); assert.equal(document.accessStatus, "NOT_LINKED");
});

test("restoring a suspended invitation returns to INVITED, never assumed ACTIVE", async () => {
  const document = makeDoc({ status: "SUSPENDED", accessStatus: "SUSPENDED",
    accessStatusBeforeSuspension: "INVITED" });
  const { controller } = fixture({ document }); const res = response();
  await controller.updateConductorStatus({ adminInfo: { id: adminId }, params: { id: profileId },
    body: { status: "AVAILABLE" } }, res);
  assert.equal(res.code, 200); assert.equal(document.accessStatus, "INVITED");
  assert.equal(document.accessStatusBeforeSuspension, null);
});

test("admin staff routes retain authentication and invitation rate limiting", () => {
  const source = fs.readFileSync(path.join(__dirname, "../../../routes/adminRoutes/adminRoutes.js"), "utf8");
  assert.match(source, /router\.post\("\/conductors", adminMiddleware, requireAccountAdministration, require\("\.\.\/\.\.\/middleware\/adminCrewInviteRateLimit"\), conductorController\.createConductor\)/);
  assert.match(source, /router\.get\("\/brands\/:brandId\/conductors", adminMiddleware, conductorController\.getConductorsByBrand\)/);
  assert.match(source, /router\.patch\("\/conductors\/:id\/status", adminMiddleware, conductorController\.updateConductorStatus\)/);
});

test("admin-created conductor metadata is represented in the profile schema and assignment service", () => {
  const model = fs.readFileSync(path.join(__dirname, "../../../models/conductorProfileModel.js"), "utf8");
  const service = fs.readFileSync(path.join(__dirname, "../../../src/modules/bus-owner/crew/crew-profile-persistence.service.js"), "utf8");
  assert.match(model, /createdBy:[\s\S]*enum: \["ADMIN", "OPERATOR"\]/);
  assert.match(model, /adminCreatedBy:[\s\S]*ref: "SuperAdmin"/);
  assert.match(service, /source === "ADMIN" \? \{ adminCreatedBy: adminId \}/);
});
