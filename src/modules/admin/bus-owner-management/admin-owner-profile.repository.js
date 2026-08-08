"use strict";

const BusOwner = require("../../../../models/busOwnerModel");
const User = require("../../../../models/userModel");

function createAdminOwnerProfileRepository(deps = {}) {
  const BusOwnerModel = deps.BusOwner || BusOwner;
  const UserModel = deps.User || User;

  async function findOwnerForProfileUpdate(ownerId) {
    return BusOwnerModel.findById(ownerId);
  }

  async function findLinkedUserForProfileUpdate(userId) {
    return UserModel.findById(userId);
  }

  async function findUserConflict({ currentUserId, email, phone }) {
    const conditions = [];
    if (email) conditions.push({ email });
    if (phone) conditions.push({ phone });
    if (conditions.length === 0) return null;

    const conflict = await UserModel.findOne({
      _id: { $ne: currentUserId },
      $or: conditions,
    }).lean();

    if (!conflict) return null;
    if (email && conflict.email === email) return "email";
    if (phone && conflict.phone === phone) return "phone";
    return null;
  }

  async function updateUserWithVersion({ userId, expectedVersion, set }) {
    return UserModel.findOneAndUpdate(
      { _id: userId, __v: expectedVersion },
      { $set: set, $inc: { __v: 1 } },
      { new: true, runValidators: true }
    ).exec();
  }

  async function updateOwnerWithVersion({ ownerId, expectedVersion, set, auditEvent }) {
    const update = { $inc: { __v: 1 } };
    if (set && Object.keys(set).length > 0) {
      update.$set = set;
    }
    if (auditEvent) {
      update.$push = { adminProfileAuditHistory: auditEvent };
    }
    return BusOwnerModel.findOneAndUpdate(
      { _id: ownerId, __v: expectedVersion },
      update,
      { new: true, runValidators: true }
    ).exec();
  }

  async function restoreUserSnapshot({ userId, expectedCurrentVersion, snapshot }) {
    return UserModel.findOneAndUpdate(
      { _id: userId, __v: expectedCurrentVersion },
      { $set: snapshot, $inc: { __v: 1 } },
      { new: true, runValidators: true }
    ).exec();
  }

  return {
    findOwnerForProfileUpdate,
    findLinkedUserForProfileUpdate,
    findUserConflict,
    updateUserWithVersion,
    updateOwnerWithVersion,
    restoreUserSnapshot,
  };
}

module.exports = { createAdminOwnerProfileRepository };
