"use strict";

const { toIsoDate } = require("../common/read-date.mapper");

function mapAdminBusOwnerListItem(owner, fleetCount = 0) {
  if (!owner) return null;
  const user = owner.user || {};

  return {
    ownerId: String(owner._id || owner.id),
    ownerCode: owner.busOwnerId || null,
    userId: user._id ? String(user._id) : (owner.user ? String(owner.user) : null),
    name: user.name || "N/A",
    email: user.email || "N/A",
    phone: user.phone || "N/A",
    profilePicture: user.profilePicture || null,
    companyName: owner.companyName || owner.companyRegistration?.companyName || "N/A",
    verificationStatus: owner.verificationStatus || "pending",
    fleetCount: Number(fleetCount) || 0,
    userStatus: user.status || "active",
    createdAt: toIsoDate(owner.createdAt),
    updatedAt: toIsoDate(owner.updatedAt),
  };
}

module.exports = {
  mapAdminBusOwnerListItem,
};
