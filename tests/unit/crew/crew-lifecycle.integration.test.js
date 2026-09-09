"use strict";
const { test, assert, mongoose, User, DriverProfile, ConductorProfile, OperatorBrand, createCrewAssignmentService, createCrewController, ownerId, brandId, phone, logger, response, assignment, input, assign, seedUser } = require("../../helpers/crew-lifecycle-harness");

test("account and profile commit before SMS, with canonical phone and correct brand name", async () => {
  let sends = 0;
  const service = assignment({ sendSMS: async (destination, message) => {
    sends++; assert.equal(destination, phone); assert.match(message, /Test Transport/);
    assert.match(message, /Set up invited account/); assert.match(message, /verify the SMS code/);
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
