"use strict";

const { toIsoDate } = require("../common/read-date.mapper");
const { getEffectiveKycStatus } = require("../../bus-owner/kyc-submission/kyc-submission-state");

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
      registeredAddress: owner?.registeredAddress
        ? {
            tole: owner.registeredAddress.tole || owner.registeredAddress.addressLine1 || null,
            wardNumber: owner.registeredAddress.wardNumber || null,
            municipality: owner.registeredAddress.municipality || null,
            district: owner.registeredAddress.district || null,
            province: owner.registeredAddress.province || null,
            postalCode: owner.registeredAddress.postalCode || null,
            country: owner.registeredAddress.country || "Nepal",
          }
        : null,
    },
    bank: {
      present: Boolean(owner?.bankDetails?.accountNumber || owner?.bankDetails?.bankName),
      bankName: owner?.bankDetails?.bankName || null,
      accountNumber: owner?.bankDetails?.accountNumber || null,
      accountHolderName: owner?.bankDetails?.accountHolderName || null,
      branchName: owner?.bankDetails?.branchName || null,
      swiftCode: owner?.bankDetails?.swiftCode || null,
    },
    verificationStatus: getEffectiveKycStatus(owner),
    rejectionReason: owner?.rejectionReason || null,
    createdAt: toIsoDate(owner?.createdAt || userObj.createdAt),
    updatedAt: toIsoDate(owner?.updatedAt || userObj.updatedAt),
  };
}

module.exports = {
  mapBusOwnerProfile,
};
