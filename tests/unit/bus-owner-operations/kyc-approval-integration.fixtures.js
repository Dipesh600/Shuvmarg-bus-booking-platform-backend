"use strict";

const mongoose = require("mongoose");
const { MongoMemoryReplSet } = require("mongodb-memory-server");
const Admin = require("../../../models/adminModel");
const BusOwner = require("../../../models/busOwnerModel");
const User = require("../../../models/userModel");
const OperatorBrand = require("../../../models/operatorBrandModel");
const { createKycReviewService } = require("../../../src/modules/bus-owner/kyc-review/kyc-review.service");
let replSet;
async function start() { replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } }); await mongoose.connect(replSet.getUri(), { autoIndex: true }); await Promise.all([OperatorBrand.init(), BusOwner.init(), User.init(), Admin.init()]); }
async function stop() { if (mongoose.connection.readyState) await mongoose.disconnect(); if (replSet) await replSet.stop(); }
async function clear() { await Promise.all([Admin.deleteMany({}), BusOwner.deleteMany({}), User.deleteMany({}), OperatorBrand.deleteMany({})]); }
async function setup() {
  const admin = await Admin.create({ adminId: "SM-ADM-TESTADMIN", name: "Admin User", email: `admin_${Date.now()}_${Math.random()}@shuvmarg.com`, password: "test-only-password", role: "SUPER_ADMIN", lifecycleStatus: "ACTIVE", isActive: true });
  const user = await User.create({ name: "Owner User", phone: `98${Math.floor(10000000 + Math.random() * 90000000)}`, password: "test-only-password", role: "busOwner", roles: ["busOwner"], status: "inactive", isVerified: false });
  const owner = await BusOwner.create({ user: user._id, companyName: "Himalayan Roadways", verificationStatus: "pending", companyRegistration: { documentUrls: ["company.pdf"] }, taxRegistration: { documentUrls: ["tax.pdf"] }, ownerIdentity: { documentUrls: ["citizenship.pdf"] } });
  return { admin, user, owner, actor: { adminId: admin._id.toString(), tokenRole: "SUPER_ADMIN" }, service: createKycReviewService({ Admin, BusOwner, User, OperatorBrand, mongoose }) };
}
module.exports = { mongoose, Admin, BusOwner, User, OperatorBrand, createKycReviewService, start, stop, clear, setup };
