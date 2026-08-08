"use strict";

const REQUIRED_FIELDS = Object.freeze([
  "companyName", "ownerName", "panNumber", "registrationNumber",
  "bankName", "accountHolderName", "accountNumber", "branchName",
]);
const STRUCTURED_ADDRESS_REQUIRED_FIELDS = Object.freeze([
  "registeredTole", "registeredWardNumber", "registeredMunicipality",
  "registeredDistrict", "registeredProvince", "registeredCountry",
]);
const OPTIONAL_FIELDS = Object.freeze([
  "swiftCode", "address", "registeredAddressLine1",
  "registeredAddressLine2", "registeredPostalCode",
]);
const ALLOWED_FIELDS = new Set([
  ...REQUIRED_FIELDS, ...STRUCTURED_ADDRESS_REQUIRED_FIELDS, ...OPTIONAL_FIELDS,
]);
const MAX_LENGTHS = Object.freeze({
  companyName: 200, ownerName: 200, address: 500, registeredTole: 150,
  registeredWardNumber: 2, registeredAddressLine1: 200, registeredAddressLine2: 200,
  registeredMunicipality: 100, registeredDistrict: 100, registeredProvince: 50,
  registeredPostalCode: 5, registeredCountry: 50, panNumber: 20,
  registrationNumber: 100, bankName: 200, accountHolderName: 200,
  accountNumber: 50, branchName: 200, swiftCode: 20,
});
const MIN_LENGTHS = Object.freeze({
  companyName: 2, ownerName: 2, address: 5, registeredTole: 2,
  registeredWardNumber: 1, registeredMunicipality: 2, registeredDistrict: 2,
  panNumber: 9, registrationNumber: 2, bankName: 2, accountHolderName: 2,
  accountNumber: 5, branchName: 2,
});
const NEPAL_PAN_PATTERN = /^\d{9}$/;
const ACCOUNT_NUMBER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ./-]*[A-Za-z0-9]$/;
const SWIFT_BIC_PATTERN = /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?$/;
const NEPAL_POSTAL_CODE_PATTERN = /^\d{5}$/;
const WARD_NUMBER_PATTERN = /^[1-9]\d?$/;
const NEPAL_PROVINCES = new Set([
  "Koshi", "Madhesh", "Bagmati", "Gandaki", "Lumbini", "Karnali", "Sudurpashchim",
]);
const FORBIDDEN_BODY_FIELDS = Object.freeze([
  "userId", "ownerId", "busOwnerId", "verificationStatus", "verified",
  "approved", "rejectionReason", "kycReview", "kycAuditHistory",
]);

module.exports = {
  REQUIRED_FIELDS, STRUCTURED_ADDRESS_REQUIRED_FIELDS, ALLOWED_FIELDS,
  MAX_LENGTHS, MIN_LENGTHS, NEPAL_PAN_PATTERN, ACCOUNT_NUMBER_PATTERN,
  SWIFT_BIC_PATTERN, NEPAL_POSTAL_CODE_PATTERN, WARD_NUMBER_PATTERN,
  NEPAL_PROVINCES, FORBIDDEN_BODY_FIELDS,
};
