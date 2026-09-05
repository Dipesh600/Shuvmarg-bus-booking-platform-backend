"use strict";
process.env.SECRET_KEY ||= "crew-state-test-only-secret-32chars";
const { test, before, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { MongoMemoryReplSet } = require("mongodb-memory-server");
const User = require("../../../models/userModel");
const DriverProfile = require("../../../models/driverProfileModel");
const ConductorProfile = require("../../../models/conductorProfileModel");
const OperatorBrand = require("../../../models/operatorBrandModel");
const { createCrewAssignmentService } = require("../../../src/modules/bus-owner/crew/crew-assignment.service");
const { createCrewController } = require("../../../src/modules/bus-owner/crew/crew.controller");
const ownerId = new mongoose.Types.ObjectId();
const brandId = new mongoose.Types.ObjectId();
const phone = "9800000001";
const logger = { warn() {}, error() {} };
let replica;
const response = () => ({ code: 0, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
const assignment = (overrides = {}) => createCrewAssignmentService({
  mongoose, User, DriverProfile, ConductorProfile, OperatorBrand, logger,
  randomPassword: () => "never-shared-bootstrap-secret", hashPassword: async () => "hashed-bootstrap-secret",
  sendSMS: async () => ({ queued: true }), ...overrides,
});
const input = (extra = {}) => ({ phone, name: "Crew Person", brandId: String(brandId), ...extra });
const assign = (service, role = "conductor", extra = {}) => service.assign({
  ownerId, role, input: input(role === "driver" ? { gender: "male", experienceYears: 7,
    licenseNumber: "NL123", licenseType: "HV", licenseExpiry: "2099-01-01", ...extra } : extra),
});
const seedUser = async (extra = {}) => {
  const user = { _id: new mongoose.Types.ObjectId(), name: "Existing Person", phone, password: "existing-password-hash",
    role: "passenger", roles: ["passenger", "agent"], status: "active", tokenVersion: 8, forcePasswordChange: false, ...extra };
  await User.collection.insertOne(user); return user;
};

before(async () => {
  // An isolated disposable replica set, never an environment/production URI.
  replica = await MongoMemoryReplSet.create({ binary: { version: "8.2.6" },
    instanceOpts: [{ args: ["--setParameter", "indexBuildMinAvailableDiskSpaceMB=32"] }],
    replSet: { count: 1 } });
  await mongoose.connect(replica.getUri("crew-safety-tests"));
  await Promise.all([User.init(), DriverProfile.init(), ConductorProfile.init(), OperatorBrand.init()]);
});
beforeEach(async () => {
  await Promise.all([User.deleteMany({}), DriverProfile.deleteMany({}), ConductorProfile.deleteMany({}), OperatorBrand.deleteMany({})]);
  await OperatorBrand.collection.insertOne({ _id: brandId, ownerId, status: "ACTIVE", brandName: "Test Transport" });
});
after(async () => { await mongoose.disconnect(); if (replica) await replica.stop(); });

test("account and profile commit before SMS, with canonical phone and correct brand name", async () => {
  let sends = 0;
  const service = assignment({ sendSMS: async (destination, message) => {
    sends++; assert.equal(destination, phone); assert.match(message, /Test Transport/);
    assert.match(message, /Set up invited account/); assert.match(message, /verify the OTP/);
    assert.match(message, /create your password/); assert.doesNotMatch(message, /ACTIVATE/);
    assert.doesNotMatch(message, /never-shared|hashed-bootstrap/);
    assert.equal(await User.countDocuments({ phone }), 1);
    assert.equal(await ConductorProfile.countDocuments({ phone }), 1);
    return { queued: true };
  } });
  const result = await assign(service, "conductor", { phone: "+977 9800000001" });
  assert.equal(result.notificationStatus, "QUEUED"); assert.equal(sends, 1);
  assert.equal(result.accessStatus, "INVITED");
  assert.equal(result.invitationDeliveryStatus, "QUEUED");
  const user = await User.findById(result.userId).select("+password").lean();
  assert.equal(user.status, "invited"); assert.equal(user.forcePasswordChange, true);
  assert.equal(user.password, "hashed-bootstrap-secret");
  const profile = await ConductorProfile.findById(result.profileId).lean();
  assert.equal(profile.accessStatus, "INVITED");
  assert.equal(profile.invitationDeliveryStatus, "QUEUED");
  assert.ok(profile.invitedAt); assert.ok(profile.invitationLastAttemptAt);
});
test("admin-created conductor records retain their distinct source and admin actor", async () => {
  const adminId = new mongoose.Types.ObjectId();
  const result = await assignment().assign({ ownerId, role: "conductor", input: input(),
    source: "ADMIN", adminId });
  const profile = await ConductorProfile.findById(result.profileId).lean();
  assert.equal(profile.createdBy, "ADMIN");
  assert.equal(String(profile.adminCreatedBy), String(adminId));
  assert.equal(profile.assignedBy, null);
});
test("admin-created driver records retain their distinct source and admin actor", async () => {
  const adminId = new mongoose.Types.ObjectId();
  const service = assignment({
    driverDocuments: {
      async uploadLicense() { return `brands/${brandId}/drivers/admin-evidence.webp`; },
      async cleanup() {},
    },
  });
  const result = await service.assign({ ownerId, role: "driver", source: "ADMIN", adminId,
    files: { licenseDoc: { name: "licence.png" } },
    input: input({ gender: "female", experienceYears: 4, licenseNumber: "NL-ADMIN-1",
      licenseType: "HV", licenseExpiry: "2099-01-01" }) });
  const profile = await DriverProfile.findById(result.profileId).lean();
  assert.equal(profile.createdBy, "ADMIN");
  assert.equal(String(profile.adminCreatedBy), String(adminId));
  assert.equal(profile.gender, "female");
  assert.equal(profile.experienceYears, 4);
  assert.equal(profile.licenseDoc, `brands/${brandId}/drivers/admin-evidence.webp`);
  assert.equal(profile.approvalStatus, "APPROVED");
});
test("profile failure rolls back the new account and sends no SMS", async () => {
  function FailingProfile(data) { const profile = new ConductorProfile(data); profile.save = async () => { throw new Error("save failed"); }; return profile; }
  FailingProfile.find = (...args) => ConductorProfile.find(...args);
  const service = assignment({ ConductorProfile: FailingProfile, sendSMS() { assert.fail("must not send"); } });
  await assert.rejects(assign(service), /save failed/);
  assert.equal(await User.countDocuments({ phone }), 0);
  assert.equal(await ConductorProfile.countDocuments({ phone }), 0);
});
test("profile failure rolls back a role upgrade without changing credentials or sessions", async () => {
  const user = await seedUser();
  function FailingProfile(data) { const profile = new ConductorProfile(data); profile.save = async () => { throw new Error("save failed"); }; return profile; }
  FailingProfile.find = (...args) => ConductorProfile.find(...args);
  await assert.rejects(assign(assignment({ ConductorProfile: FailingProfile })), /save failed/);
  const saved = await User.findById(user._id).select("+password").lean();
  assert.deepEqual(saved.roles, user.roles); assert.equal(saved.password, user.password); assert.equal(saved.tokenVersion, 8);
});
test("an existing active account gains the crew role without an unnecessary SMS", async () => {
  await seedUser();
  let sends = 0;
  const result = await assign(assignment({ sendSMS: async () => { sends++; return { queued: true }; } }), "driver");
  assert.equal(result.activationRequired, false);
  assert.equal(result.notificationStatus, "NOT_REQUESTED");
  assert.equal(result.accessStatus, "ACTIVE");
  assert.equal(result.invitationDeliveryStatus, "NOT_REQUIRED");
  assert.equal(sends, 0);
  const saved = await User.findById(result.userId).lean();
  assert.equal(saved.status, "active");
  assert.ok(saved.roles.includes("driver"));
  const profile = await DriverProfile.findById(result.profileId).lean();
  assert.equal(profile.accessStatus, "ACTIVE");
  assert.equal(profile.invitationDeliveryStatus, "NOT_REQUIRED");
  assert.ok(profile.activatedAt);
});
test("SMS failure is truthful and explicit resend reuses the account/profile", async () => {
  const result = await assign(assignment({ sendSMS: async () => { throw new Error("provider unavailable"); } }));
  assert.equal(result.notificationStatus, "FAILED");
  assert.equal(result.invitationDeliveryStatus, "FAILED");
  assert.equal((await ConductorProfile.findById(result.profileId)).invitationDeliveryStatus, "FAILED");
  const retry = await assign(assignment(), "conductor", { resendInvite: true });
  assert.equal(retry.notificationStatus, "QUEUED");
  assert.equal(retry.invitationDeliveryStatus, "QUEUED");
  assert.equal(String(retry.profileId), String(result.profileId));
  assert.equal(await User.countDocuments({ phone }), 1); assert.equal(await ConductorProfile.countDocuments({ phone }), 1);
});
test("driver activation code is sent only for a real pending driver invitation", async () => {
  const otpHelper = require("../../../utils/otpHelper");
  const controllerPath = require.resolve("../../../controllers/authControllers.js/activateAccountController.js");
  const originalCreate = otpHelper.createAndSendOTP;
  let sends = 0;
  otpHelper.createAndSendOTP = async (destination, purpose) => {
    sends++; assert.equal(destination, phone); assert.equal(purpose, "ACCOUNT_ACTIVATION");
    return { expiresIn: "5 minutes" };
  };
  delete require.cache[controllerPath];
  try {
    const { sendActivationOTP } = require(controllerPath);
    const req = { body: { phone }, get: (header) => header === "X-App-Source" ? "driver" : null };

    const invitedWithoutProfile = await seedUser({ role: "driver", roles: ["driver"], status: "invited" });
    let output = response();
    await sendActivationOTP(req, output);
    assert.equal(output.code, 404); assert.equal(output.body.errorCode, "INVITATION_NOT_FOUND");
    assert.equal(sends, 0);

    await User.deleteOne({ _id: invitedWithoutProfile._id });
    const active = await seedUser({ role: "driver", roles: ["driver"], status: "active" });
    output = response();
    await sendActivationOTP(req, output);
    assert.equal(output.code, 409); assert.equal(output.body.errorCode, "ACCOUNT_ALREADY_ACTIVE");
    assert.equal(sends, 0);

    await User.deleteOne({ _id: active._id });
    const pending = await seedUser({ role: "driver", roles: ["driver"], status: "invited" });
    await DriverProfile.collection.insertOne({ brandId, ownerId, userId: pending._id,
      fullName: "Pending Driver", phone, licenseNumber: "NL-PENDING", licenseType: "HV",
      licenseExpiry: new Date("2099-01-01"), status: "AVAILABLE", approvalStatus: "APPROVED",
      accessStatus: "INVITED", removedAt: null });
    output = response();
    await sendActivationOTP(req, output);
    assert.equal(output.code, 200); assert.equal(output.body.data.activationState, "OTP_SENT");
    assert.equal(output.body.data.role, "driver"); assert.equal(sends, 1);
  } finally {
    otpHelper.createAndSendOTP = originalCreate;
    delete require.cache[controllerPath];
  }
});
test("OTP activation atomically changes persisted crew access from invited to active", async () => {
  const assigned = await assign(assignment());
  const otpHelper = require("../../../utils/otpHelper");
  const tokenService = require("../../../utils/tokenService");
  const controllerPath = require.resolve("../../../controllers/authControllers.js/activateAccountController.js");
  const originalVerify = otpHelper.verifyOTPCode;
  const originalRevoke = tokenService.revokeAllUserTokens;
  const originalGenerate = tokenService.generateTokenPair;
  otpHelper.verifyOTPCode = async () => ({ valid: true });
  tokenService.revokeAllUserTokens = async () => {};
  let generatedForRole = null;
  tokenService.generateTokenPair = async (_user, meta) => {
    generatedForRole = meta.activeRole;
    return { accessToken: "access", refreshToken: "refresh" };
  };
  delete require.cache[controllerPath];
  try {
    const { activateAccount } = require(controllerPath);
    const output = { code: 0, cookies: [], status(code) { this.code = code; return this; },
      cookie(...args) { this.cookies.push(args); return this; }, json(body) { this.body = body; return this; } };
    await activateAccount({ body: { phone, otp: "123456", newPassword: "NewPass123" },
      get: (header) => header === "X-App-Source" ? "conductor" : "test-agent",
      ip: "127.0.0.1", connection: {} }, output);
    assert.equal(output.code, 200);
    assert.equal(output.body.activeRole, "conductor");
    assert.equal(generatedForRole, "conductor");
    const user = await User.findById(assigned.userId).lean();
    const profile = await ConductorProfile.findById(assigned.profileId).lean();
    assert.equal(user.status, "active"); assert.equal(user.phoneVerified, true);
    assert.equal(profile.accessStatus, "ACTIVE");
    assert.equal(profile.invitationDeliveryStatus, "NOT_REQUIRED");
    assert.ok(profile.activatedAt);
  } finally {
    otpHelper.verifyOTPCode = originalVerify;
    tokenService.revokeAllUserTokens = originalRevoke;
    tokenService.generateTokenPair = originalGenerate;
    delete require.cache[controllerPath];
  }
});
test("duplicate assignment is idempotent and does not send another SMS by default", async () => {
  await assign(assignment());
  const retry = await assign(assignment({ sendSMS() { assert.fail("must not resend"); } }));
  assert.equal(retry.alreadyAssigned, true); assert.equal(retry.notificationStatus, "NOT_REQUESTED");
});
test("concurrent assignments converge on one profile for an existing account", async () => {
  await seedUser();
  const service = assignment();
  const results = await Promise.all([assign(service), assign(service)]);
  assert.equal(String(results[0].profileId), String(results[1].profileId));
  assert.equal(await ConductorProfile.countDocuments({ phone }), 1);
});
test("concurrent driver assignments do not duplicate profiles despite optional non-unique userId", async () => {
  await seedUser();
  const service = assignment();
  const results = await Promise.all([assign(service, "driver"), assign(service, "driver")]);
  assert.equal(String(results[0].profileId), String(results[1].profileId));
  assert.equal(await DriverProfile.countDocuments({ phone }), 1);
});
test("driver evidence is stored before the profile commits and the activation SMS is sent afterward", async () => {
  const order = [];
  const service = assignment({
    driverDocuments: {
      async uploadLicense() { order.push("store"); return `brands/${brandId}/drivers/evidence.webp`; },
      async cleanup() { order.push("cleanup"); },
    },
    sendSMS: async () => {
      const profile = await DriverProfile.findOne({ phone }).lean();
      assert.equal(profile.licenseDoc, `brands/${brandId}/drivers/evidence.webp`);
      assert.equal(profile.gender, "male"); assert.equal(profile.experienceYears, 7);
      order.push("sms"); return { queued: true };
    },
  });
  const result = await service.assign({ ownerId, role: "driver", files: { licenseDoc: { name: "licence.png" } },
    input: input({ gender: "male", experienceYears: 7, licenseNumber: "NL123", licenseType: "HV", licenseExpiry: "2099-01-01" }) });
  assert.equal(result.notificationStatus, "QUEUED");
  assert.equal((await DriverProfile.findById(result.profileId)).approvalStatus, "APPROVED");
  assert.deepEqual(order, ["store", "sms"]);
});
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

test("driver removal preserves shared account and a compliant rehire is immediately ready", async () => {
  const user = await seedUser();
  const result = await assign(assignment(), "driver");
  await DriverProfile.updateOne({ _id: result.profileId }, { approvalStatus: "APPROVED", assignedBusId: new mongoose.Types.ObjectId() });
  const controller = createCrewController({ assignmentService: assignment(), DriverProfile, ConductorProfile, logger });
  const res = response();
  await controller.removeDriver({ userInfo: { id: ownerId }, body: { driverUserId: result.userId } }, res);
  assert.equal(res.code, 200);
  const removed = await DriverProfile.findById(result.profileId);
  assert.equal(removed.status, "INACTIVE"); assert.equal(removed.assignedBusId, null);
  assert.equal(removed.accessStatus, "REMOVED");
  assert.equal((await User.findById(user._id)).tokenVersion, 8);
  await assign(assignment(), "driver");
  const rehired = await DriverProfile.findById(result.profileId);
  assert.equal(rehired.approvalStatus, "APPROVED"); assert.equal(rehired.assignedBusId, null);
  assert.equal(rehired.accessStatus, "ACTIVE");
});

test("stale admin approval cannot overwrite a simultaneous compliance edit", async () => {
  const driver = await DriverProfile.create({ ownerId, brandId, fullName: "Registry Person", phone,
    licenseNumber: "NL123", licenseType: "HV", licenseExpiry: "2099-01-01", licenseDoc: "evidence.pdf" });
  const stale = await DriverProfile.findById(driver._id);
  const edited = await DriverProfile.findById(driver._id);
  edited.licenseNumber = "CORRECTED"; await edited.save();
  stale.approvalStatus = "APPROVED";
  await assert.rejects(stale.save(), { name: "VersionError" });
  assert.equal((await DriverProfile.findById(driver._id)).approvalStatus, "PENDING");
});

test("stale profile save cannot undo an operator removal", async () => {
  const result = await assign(assignment(), "driver");
  const stale = await DriverProfile.findById(result.profileId);
  const controller = createCrewController({ assignmentService: assignment(), DriverProfile, ConductorProfile, logger });
  await controller.removeDriver({ userInfo: { id: ownerId }, body: { driverUserId: result.userId } }, response());
  stale.status = "AVAILABLE"; stale.approvalStatus = "APPROVED";
  await assert.rejects(stale.save(), { name: "VersionError" });
  assert.equal((await DriverProfile.findById(result.profileId)).status, "INACTIVE");
});
