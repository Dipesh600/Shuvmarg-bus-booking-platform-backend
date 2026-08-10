"use strict";

const mongoose = require("mongoose");

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const REQUIRED_OWNER_FIELDS = [
  "companyName",
  "ownerName",
  "phone",
  "address",
  "bankName",
  "accountHolderName",
  "accountNumber",
  "branchName",
];

const hasRequiredOwnerFields = (body) =>
  REQUIRED_OWNER_FIELDS.every((field) => Boolean(body[field]));

const VALID_KYC_DOCUMENT_TYPES = [
  "companyRegistration",
  "ownerIdentity",
  "taxRegistration",
];

module.exports = {
  isValidObjectId,
  hasRequiredOwnerFields,
  VALID_KYC_DOCUMENT_TYPES,
};
