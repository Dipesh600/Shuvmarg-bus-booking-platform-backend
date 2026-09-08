"use strict";
const { test, assert, mongoose, User, DriverProfile, ConductorProfile, OperatorBrand, createCrewAssignmentService, createCrewController, ownerId, brandId, phone, logger, response, assignment, input, assign, seedUser } = require("../../helpers/crew-lifecycle-harness");

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
