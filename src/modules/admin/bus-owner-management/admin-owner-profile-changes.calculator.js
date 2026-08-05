"use strict";

const {
  GENERAL_PROFILE_FIELDS,
  KYC_SIGNIFICANT_FIELDS,
  OWNER_FIELD_PATHS,
} = require("./admin-owner-profile.constants");

function getNestedOwnerField(owner, fieldName) {
  if (!owner) return null;
  switch (fieldName) {
    case "companyName":
      return owner.companyName || null;
    case "panNumber":
      return owner.taxRegistration?.panNumber || null;
    case "registrationNumber":
      return owner.taxRegistration?.registrationNumber || null;
    case "bankName":
      return owner.bankDetails?.bankName || null;
    case "accountNumber":
      return owner.bankDetails?.accountNumber || null;
    case "accountHolderName":
      return owner.bankDetails?.accountHolderName || null;
    case "branchName":
      return owner.bankDetails?.branchName || null;
    case "swiftCode":
      return owner.bankDetails?.swiftCode || null;
    default:
      return null;
  }
}

function calculateProfileChanges({ user, owner, updates }) {
  const userSet = {};
  const userSnapshot = {};
  const ownerSet = {};
  const changedFields = [];

  for (const field of GENERAL_PROFILE_FIELDS) {
    if (updates[field] !== undefined) {
      const currentVal = field === "email" ? (user.email ? user.email.toLowerCase() : null) : (user[field] || null);
      if (updates[field] !== currentVal) {
        userSet[field] = updates[field];
        userSnapshot[field] = currentVal;
        changedFields.push(field);
      }
    }
  }

  for (const field of KYC_SIGNIFICANT_FIELDS) {
    if (updates[field] !== undefined) {
      const currentVal = getNestedOwnerField(owner, field);
      if (updates[field] !== currentVal) {
        ownerSet[OWNER_FIELD_PATHS[field]] = updates[field];
        changedFields.push(field);
      }
    }
  }

  return { userSet, userSnapshot, ownerSet, changedFields };
}

module.exports = { calculateProfileChanges, getNestedOwnerField };
