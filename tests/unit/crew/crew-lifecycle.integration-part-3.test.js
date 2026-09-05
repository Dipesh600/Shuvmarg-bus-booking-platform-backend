"use strict";
const { test, assert, mongoose, User, DriverProfile, ConductorProfile, OperatorBrand, createCrewAssignmentService, createCrewController, ownerId, brandId, phone, logger, response, assignment, input, assign, seedUser } = require("../../helpers/crew-lifecycle-harness");

test("an expired owner-submitted licence is rejected before storage or account creation", async () => {
  let uploads = 0;
  const service = assignment({
    driverDocuments: {
      async uploadLicense() { uploads++; return "must-not-store.pdf"; },
      async cleanup() {},
    },
  });
  await assert.rejects(service.assign({ ownerId, role: "driver", files: { licenseDoc: { name: "licence.pdf" } },
    input: input({ gender: "male", experienceYears: 7, licenseNumber: "NL123",
      licenseType: "HV", licenseExpiry: "2000-01-01" }) }), /expired/);
  assert.equal(uploads, 0); assert.equal(await User.countDocuments({}), 0);
});
for (const status of ["banned", "inactive", "pending"]) {
  test(`cannot provision restricted ${status} account`, async () => {
    await seedUser({ status }); await assert.rejects(assign(assignment()), { statusCode: 409 });
    assert.equal(await ConductorProfile.countDocuments({}), 0);
  });
}
test("deleted and passwordless accounts are not silently activated or given unusable roles", async () => {
  const user = await seedUser({ password: null });
  await assert.rejects(assign(assignment()), { errorCode: "CREW_PASSWORD_SETUP_REQUIRED" });
  await User.updateOne({ _id: user._id }, { deletedAt: new Date(), password: "restored-password" });
  await assert.rejects(assign(assignment()), { statusCode: 409 });
  assert.equal(await ConductorProfile.countDocuments({}), 0);
});
test("removal and rehire preserve other roles, password and sessions while clearing trip access", async () => {
  const original = await seedUser();
  const result = await assign(assignment());
  await ConductorProfile.updateOne({ _id: result.profileId }, { assignedTripIds: [new mongoose.Types.ObjectId()] });
  const controller = createCrewController({ assignmentService: assignment(), DriverProfile, ConductorProfile, logger });
  const res = response();
  await controller.removeConductor({ userInfo: { id: ownerId }, body: { conductorUserId: result.userId } }, res);
  assert.equal(res.code, 200);
  const user = await User.findById(original._id).select("+password").lean();
  assert.equal(user.status, "active"); assert.equal(user.password, original.password);
  assert.equal(user.tokenVersion, 8); assert.ok(user.roles.includes("agent")); assert.equal(user.forcePasswordChange, false);
  const removed = await ConductorProfile.findById(result.profileId).lean();
  assert.equal(removed.status, "INACTIVE"); assert.equal(removed.assignedTripIds.length, 0); assert.ok(removed.removedAt);
  assert.equal(removed.accessStatus, "REMOVED");
  const rehired = await assign(assignment());
  assert.equal(String(rehired.profileId), String(result.profileId));
  const current = await ConductorProfile.findById(result.profileId).lean();
  assert.equal(current.status, "AVAILABLE"); assert.equal(current.removedAt, null); assert.equal(current.assignedTripIds.length, 0);
  assert.equal(current.accessStatus, "ACTIVE");
});
test("removal cannot erase an admin suspension to permit operator rehire", async () => {
  const result = await assign(assignment());
  await ConductorProfile.updateOne({ _id: result.profileId }, { status: "SUSPENDED" });
  const controller = createCrewController({ assignmentService: assignment(), DriverProfile, ConductorProfile, logger });
  const res = response();
  await controller.removeConductor({ userInfo: { id: ownerId }, body: { conductorUserId: result.userId } }, res);
  assert.equal(res.code, 200);
  assert.equal((await ConductorProfile.findById(result.profileId)).status, "SUSPENDED");
  await assert.rejects(assign(assignment()), /suspended/);
});
test("driver onboarding reuses matching unlinked admin registry profile and preserves documents", async () => {
  const registry = await DriverProfile.create({ ownerId, brandId, fullName: "Registry Person", phone,
    licenseNumber: "NL123", licenseType: "HV", licenseExpiry: "2099-01-01", licenseDoc: "existing.pdf", approvalStatus: "APPROVED" });
  const result = await assign(assignment(), "driver");
  assert.equal(String(result.profileId), String(registry._id)); assert.equal(await DriverProfile.countDocuments({}), 1);
  const linked = await DriverProfile.findById(registry._id);
  assert.equal(linked.licenseDoc, "existing.pdf"); assert.equal(linked.approvalStatus, "APPROVED"); assert.ok(linked.userId);
  assert.equal(linked.accessStatus, "INVITED");
});
test("legacy pending driver requires a fresh secure upload and becomes ready automatically afterward", async () => {
  const registry = await DriverProfile.create({ ownerId, brandId, fullName: "Legacy Driver", phone,
    gender: "male", experienceYears: 7, licenseNumber: "NL123", licenseType: "HV",
    licenseExpiry: "2099-01-01", licenseDoc: "legacy-unverified.pdf", approvalStatus: "PENDING" });
  let uploads = 0;
  const service = assignment({
    driverDocuments: {
      async uploadLicense() { uploads++; return `brands/${brandId}/drivers/verified.webp`; },
      async cleanup() {},
    },
  });
  await assert.rejects(assign(service, "driver"), /again to complete the security checks/);
  assert.equal(uploads, 0); assert.equal(await User.countDocuments({}), 0);
  const linkedUser = await seedUser();
  await DriverProfile.updateOne({ _id: registry._id }, { userId: linkedUser._id });

  const result = await service.assign({ ownerId, role: "driver", files: { licenseDoc: { name: "licence.png" } },
    input: input({ gender: "male", experienceYears: 7, licenseNumber: "NL123",
      licenseType: "HV", licenseExpiry: "2099-01-01" }) });
  const refreshed = await DriverProfile.findById(registry._id).lean();
  assert.equal(uploads, 1); assert.equal(String(result.profileId), String(registry._id));
  assert.equal(result.alreadyAssigned, true); assert.equal(result.securityUpdated, true);
  assert.equal(result.approvalStatus, "APPROVED"); assert.equal(result.profileStatus, "AVAILABLE");
  assert.equal(refreshed.approvalStatus, "APPROVED"); assert.equal(refreshed.status, "AVAILABLE");
  assert.equal(refreshed.licenseDoc, `brands/${brandId}/drivers/verified.webp`);
});
test("operator cannot restore an explicitly rejected driver or trigger upload and account side effects", async () => {
  await DriverProfile.create({ ownerId, brandId, fullName: "Blocked Driver", phone,
    gender: "male", experienceYears: 7, licenseNumber: "NL123", licenseType: "HV",
    licenseExpiry: "2099-01-01", licenseDoc: "evidence.pdf", approvalStatus: "REJECTED", status: "INACTIVE" });
  let uploads = 0;
  const service = assignment({ driverDocuments: {
    async uploadLicense() { uploads++; return "must-not-upload.webp"; }, async cleanup() {},
  } });
  await assert.rejects(service.assign({ ownerId, role: "driver", files: { licenseDoc: { name: "licence.png" } },
    input: input({ gender: "male", experienceYears: 7, licenseNumber: "NL123",
      licenseType: "HV", licenseExpiry: "2099-01-01" }) }), /blocked and cannot be restored/);
  assert.equal(uploads, 0); assert.equal(await User.countDocuments({}), 0);
});
test("registry license mismatch and cross-brand conductor reuse fail without account side effects", async () => {
  await DriverProfile.create({ ownerId, brandId, fullName: "Registry Person", phone,
    licenseNumber: "OTHER", licenseType: "HV", licenseExpiry: "2099-01-01" });
  await assert.rejects(assign(assignment(), "driver"), /license does not match/);
  assert.equal(await User.countDocuments({}), 0);
  const user = await seedUser();
  await ConductorProfile.create({ ownerId, brandId: new mongoose.Types.ObjectId(), userId: user._id, fullName: "Other Crew", phone });
  await assert.rejects(assign(assignment()), /linked elsewhere/);
  assert.deepEqual((await User.findById(user._id)).roles.toObject(), ["passenger", "agent"]);
});
test("owner scope protects removal and inactive brands reject assignment", async () => {
  const result = await assign(assignment());
  const controller = createCrewController({ assignmentService: assignment(), DriverProfile, ConductorProfile, logger });
  const res = response();
  await controller.removeConductor({ userInfo: { id: new mongoose.Types.ObjectId() }, body: { conductorUserId: result.userId } }, res);
  assert.equal(res.code, 404);
  await OperatorBrand.updateOne({ _id: brandId }, { status: "SUSPENDED" });
  await assert.rejects(assign(assignment()), { statusCode: 403 });
});

