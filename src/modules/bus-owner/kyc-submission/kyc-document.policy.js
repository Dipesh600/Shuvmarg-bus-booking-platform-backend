"use strict";

const KYC_DOCUMENT_POLICY = Object.freeze({
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
  transportLicense: {
    required: true,
    multiple: false,
    folder: "bus_owner_kyc/transport_license",
  },
  insuranceCertificates: {
    required: false,
    multiple: true,
    maxFiles: 5,
    folder: "bus_owner_kyc/insurance",
  },
});

const MAX_INDIVIDUAL_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_TOTAL_FILES = 8;

const ALLOWED_TRIPLETS = Object.freeze([
  {
    format: "pdf",
    mime: "application/pdf",
    extensions: [".pdf"],
    signature: Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]), // %PDF-
  },
  {
    format: "jpeg",
    mime: "image/jpeg",
    extensions: [".jpg", ".jpeg"],
    signature: Buffer.from([0xff, 0xd8, 0xff]),
  },
  {
    format: "png",
    mime: "image/png",
    extensions: [".png"],
    signature: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  },
]);

module.exports = {
  KYC_DOCUMENT_POLICY,
  MAX_INDIVIDUAL_FILE_SIZE,
  MAX_TOTAL_FILES,
  ALLOWED_TRIPLETS,
};
