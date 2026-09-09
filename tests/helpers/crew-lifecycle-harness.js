"use strict";
process.env.SECRET_KEY ||= "crew-state-test-only-secret-32chars";
const { test, before, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { MongoMemoryReplSet } = require("mongodb-memory-server");
const User = require("../../models/userModel");
const DriverProfile = require("../../models/driverProfileModel");
const ConductorProfile = require("../../models/conductorProfileModel");
const OperatorBrand = require("../../models/operatorBrandModel");
const NotificationOutbox = require("../../models/notificationOutboxModel");
const { createCrewAssignmentService } = require("../../src/modules/bus-owner/crew/crew-assignment.service");
const { createCrewController } = require("../../src/modules/bus-owner/crew/crew.controller");
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
  await Promise.all([User.init(), DriverProfile.init(), ConductorProfile.init(), OperatorBrand.init(), NotificationOutbox.init()]);
});
beforeEach(async () => {
  await Promise.all([User.deleteMany({}), DriverProfile.deleteMany({}), ConductorProfile.deleteMany({}), OperatorBrand.deleteMany({}), NotificationOutbox.deleteMany({})]);
  await OperatorBrand.collection.insertOne({ _id: brandId, ownerId, status: "ACTIVE", brandName: "Test Transport" });
});
after(async () => { await mongoose.disconnect(); if (replica) await replica.stop(); });


module.exports = { test, assert, mongoose, User, DriverProfile, ConductorProfile, OperatorBrand, createCrewAssignmentService, createCrewController, ownerId, brandId, phone, logger, response, assignment, input, assign, seedUser };
