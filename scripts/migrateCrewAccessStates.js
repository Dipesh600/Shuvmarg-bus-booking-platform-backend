"use strict";

require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../models/userModel");
const DriverProfile = require("../models/driverProfileModel");
const ConductorProfile = require("../models/conductorProfileModel");

const apply = process.argv.includes("--apply");
const ACCESS = new Set(["NOT_LINKED", "INVITED", "ACTIVE", "SUSPENDED", "REMOVED"]);
const DELIVERY = new Set(["NOT_REQUIRED", "PENDING", "QUEUED", "FAILED"]);

const stateFor = (profile, user) => {
  if (!profile.userId || !user) return "NOT_LINKED";
  if (profile.removedAt) return "REMOVED";
  if (profile.status === "SUSPENDED" || profile.approvalStatus === "REJECTED") return "SUSPENDED";
  if (user.status === "invited") return "INVITED";
  if (user.status === "active") return "ACTIVE";
  return "SUSPENDED";
};

const migrationUpdateFor = (profile, user, role, now = new Date()) => {
  const accessStatus = ACCESS.has(profile.accessStatus) ? profile.accessStatus : stateFor(profile, user);
  const existingDelivery = DELIVERY.has(profile.invitationDeliveryStatus)
    ? profile.invitationDeliveryStatus : null;
  const invitationDeliveryStatus = accessStatus === "ACTIVE" ? "NOT_REQUIRED"
    : accessStatus === "INVITED"
      ? existingDelivery && existingDelivery !== "NOT_REQUIRED" ? existingDelivery : "PENDING"
      : existingDelivery || "NOT_REQUIRED";
  const inferredPrevious = user?.status === "invited" ? "INVITED"
    : user?.status === "active" ? "ACTIVE" : null;
  const accessStatusBeforeSuspension = accessStatus === "SUSPENDED"
    ? (["INVITED", "ACTIVE"].includes(profile.accessStatusBeforeSuspension)
      ? profile.accessStatusBeforeSuspension : inferredPrevious)
    : null;
  const set = { accessStatus, invitationDeliveryStatus, accessStatusBeforeSuspension };
  if (accessStatus === "INVITED") set.invitedAt = profile.invitedAt || profile.createdAt || now;
  if (accessStatus === "ACTIVE") {
    set.activatedAt = profile.activatedAt || user?.roleActivatedAt?.[role] || profile.createdAt || now;
  }
  return set;
};

async function migrateModel(Model, role) {
  // Read the raw collection so schema defaults cannot make a legacy field look
  // persisted when it is absent in MongoDB.
  const profiles = await Model.collection.find({}, { projection: { userId: 1, status: 1,
    approvalStatus: 1, removedAt: 1, createdAt: 1, accessStatus: 1,
    invitationDeliveryStatus: 1, invitedAt: 1, activatedAt: 1,
    accessStatusBeforeSuspension: 1 } }).toArray();
  const userIds = [...new Set(profiles.map(profile => String(profile.userId || "")).filter(Boolean))];
  const objectIds = userIds.filter(mongoose.isValidObjectId).map(value => new mongoose.Types.ObjectId(value));
  const users = await User.collection.find({ _id: { $in: objectIds } }, {
    projection: { status: 1, roleActivatedAt: 1 },
  }).toArray();
  const userById = new Map(users.map(user => [String(user._id), user]));
  const counts = {};
  const deliveryCounts = {};
  let alreadyExplicit = 0;
  let backfilled = 0;
  let unresolvedSuspensions = 0;
  const operations = profiles.map(profile => {
    const user = userById.get(String(profile.userId || ""));
    const set = migrationUpdateFor(profile, user, role);
    const { accessStatus } = set;
    counts[accessStatus] = (counts[accessStatus] || 0) + 1;
    deliveryCounts[set.invitationDeliveryStatus] = (deliveryCounts[set.invitationDeliveryStatus] || 0) + 1;
    if (ACCESS.has(profile.accessStatus)) alreadyExplicit++; else backfilled++;
    if (accessStatus === "SUSPENDED" && !set.accessStatusBeforeSuspension) unresolvedSuspensions++;
    return { updateOne: { filter: { _id: profile._id }, update: { $set: set } } };
  });
  if (apply && operations.length) await Model.bulkWrite(operations, { ordered: false });
  return { role, records: profiles.length, alreadyExplicit, backfilled,
    unresolvedSuspensions, counts, deliveryCounts };
}

async function main() {
  if (!process.env.MONGODB_URL) throw new Error("MONGODB_URL is required.");
  await mongoose.connect(process.env.MONGODB_URL);
  const results = await Promise.all([
    migrateModel(DriverProfile, "driver"),
    migrateModel(ConductorProfile, "conductor"),
  ]);
  console.log(JSON.stringify({ mode: apply ? "APPLIED" : "DRY_RUN", results }, null, 2));
  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch(async error => {
    console.error(error.message);
    try { await mongoose.disconnect(); } catch {}
    process.exit(1);
  });
}

module.exports = { stateFor, migrationUpdateFor };
