"use strict";

const { toIsoDate } = require("../common/read-date.mapper");

function mapBusOwnerProfile(owner, user) {
  if (!owner && !user) return null;
  const userObj = user || owner?.user || {};

  return {
    ownerId: owner?._id ? String(owner._id) : null,
    ownerCode: owner?.busOwnerId || null,
    userId: userObj._id ? String(userObj._id) : (owner?.user ? String(owner.user) : null),
    profile: {
      name: userObj.name || "N/A",
      email: userObj.email || "N/A",
      phone: userObj.phone || "N/A",
      profilePicture: userObj.profilePicture || null,
      status: userObj.status || "active",
    },
    business: {
      companyName: owner?.companyName || owner?.companyRegistration?.companyName || "N/A",
    },
    bank: {
      present: Boolean(owner?.bankDetails?.accountNumber || owner?.bankDetails?.bankName),
      bankName: owner?.bankDetails?.bankName || null,
      accountNumber: owner?.bankDetails?.accountNumber || null,
      accountHolderName: owner?.bankDetails?.accountHolderName || null,
      branchName: owner?.bankDetails?.branchName || null,
      swiftCode: owner?.bankDetails?.swiftCode || null,
    },
    verificationStatus: owner?.verificationStatus || "pending",
    rejectionReason: owner?.rejectionReason || null,
    createdAt: toIsoDate(owner?.createdAt || userObj.createdAt),
    updatedAt: toIsoDate(owner?.updatedAt || userObj.updatedAt),
  };
}

module.exports = {
  mapBusOwnerProfile,
};
