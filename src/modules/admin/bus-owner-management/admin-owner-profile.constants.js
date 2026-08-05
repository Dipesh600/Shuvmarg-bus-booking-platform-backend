"use strict";

const ALLOWED_PROFILE_FIELDS = Object.freeze([
  "id",
  "name",
  "address",
  "email",
  "phone",
  "companyName",
  "panNumber",
  "registrationNumber",
  "bankName",
  "accountNumber",
  "accountHolderName",
  "branchName",
  "swiftCode",
  "changeReason",
]);

const GENERAL_PROFILE_FIELDS = Object.freeze([
  "name",
  "address",
  "email",
  "phone",
]);

const KYC_SIGNIFICANT_FIELDS = Object.freeze([
  "companyName",
  "panNumber",
  "registrationNumber",
  "bankName",
  "accountNumber",
  "accountHolderName",
  "branchName",
  "swiftCode",
]);

const PRIVILEGED_FIELDS = Object.freeze([
  "user",
  "userId",
  "ownerId",
  "roles",
  "status",
  "isVerified",
  "verificationStatus",
  "kycReview",
  "kycAuditHistory",
  "documentUrls",
  "companyRegistration",
  "ownerIdentity",
  "taxRegistration",
  "bankDetails",
  "transportLicense",
  "insuranceCertificates",
  "rejectionReason",
  "reviewedBy",
  "reviewedAt",
  "createdAt",
  "updatedAt",
  "adminProfileAuditHistory",
]);

const PROFILE_FIELD_LIMITS = Object.freeze({
  name: 100,
  companyName: 150,
  address: 255,
  email: 254,
  panNumber: 30,
  registrationNumber: 50,
  bankName: 100,
  accountNumber: 50,
  accountHolderName: 100,
  branchName: 100,
  swiftCode: 20,
  changeReason: 500,
});

const OWNER_FIELD_PATHS = Object.freeze({
  companyName: "companyName",
  panNumber: "taxRegistration.panNumber",
  registrationNumber: "taxRegistration.registrationNumber",
  bankName: "bankDetails.bankName",
  accountNumber: "bankDetails.accountNumber",
  accountHolderName: "bankDetails.accountHolderName",
  branchName: "bankDetails.branchName",
  swiftCode: "bankDetails.swiftCode",
});

module.exports = {
  ALLOWED_PROFILE_FIELDS,
  GENERAL_PROFILE_FIELDS,
  KYC_SIGNIFICANT_FIELDS,
  PRIVILEGED_FIELDS,
  PROFILE_FIELD_LIMITS,
  OWNER_FIELD_PATHS,
};
