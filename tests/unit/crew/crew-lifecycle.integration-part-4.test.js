"use strict";
const { test, assert, mongoose, User, DriverProfile, ConductorProfile, OperatorBrand, createCrewAssignmentService, createCrewController, ownerId, brandId, phone, logger, response, assignment, input, assign, seedUser } = require("../../helpers/crew-lifecycle-harness");

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
