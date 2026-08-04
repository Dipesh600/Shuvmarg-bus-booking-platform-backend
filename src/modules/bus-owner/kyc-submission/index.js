"use strict";

const cloudinary = require("../../../../handlers/cloudinary");
const BusOwner = require("../../../../models/busOwnerModel");
const {
  createCloudinaryUploadService,
} = require("./cloudinary-upload.service");
const {
  createKycSubmissionService,
} = require("./kyc-submission.service");
const {
  createKycSubmissionController,
} = require("./kyc-submission.controller");

const uploadService = createCloudinaryUploadService({ cloudinary });
const kycSubmissionService = createKycSubmissionService({
  BusOwner,
  uploadService,
});

module.exports = createKycSubmissionController({
  BusOwner,
  uploadService,
  kycSubmissionService,
});
