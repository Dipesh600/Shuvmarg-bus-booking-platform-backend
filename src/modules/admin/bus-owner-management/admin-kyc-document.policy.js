"use strict";

const ADMIN_CREATION_KYC_POLICY = Object.freeze({
  companyRegistration: {
    required: true,
    multiple: false,
    folder: "bus_owner_kyc/company_registration",
  },
  taxRegistration: {
    required: true,
    multiple: false,
    folder: "bus_owner_kyc/tax_registration",
  },
  ownerIdentity: {
    required: true,
    multiple: false,
    folder: "bus_owner_kyc/owner_identity",
  },
});

const ADMIN_REUPLOAD_ALLOWED_TYPES = Object.freeze([
  "companyRegistration",
  "ownerIdentity",
  "taxRegistration",
]);

module.exports = {
  ADMIN_CREATION_KYC_POLICY,
  ADMIN_REUPLOAD_ALLOWED_TYPES,
};
