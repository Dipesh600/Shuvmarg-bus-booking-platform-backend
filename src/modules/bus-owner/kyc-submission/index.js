"use strict";

const cloudinary = require("../../../../handlers/cloudinary");
const BusOwner = require("../../../../models/busOwnerModel");
const {
  createCloudinaryUploadService,
} = require("./cloudinary-upload.service");
const {
  createKycSubmissionController,
} = require("./kyc-submission.controller");

module.exports = createKycSubmissionController({
  BusOwner,
  uploadService: createCloudinaryUploadService({ cloudinary }),
});
