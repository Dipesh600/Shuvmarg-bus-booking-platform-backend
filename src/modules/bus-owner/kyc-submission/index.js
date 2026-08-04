"use strict";

const BusOwner = require("../../../../models/busOwnerModel");
const {
  uploadFileToS3,
  deleteObjectFromS3,
  buildS3Path,
  getPresignedUrl,
} = require("../../../../services/s3Service");
const {
  createKycDocumentStorageService,
} = require("./kyc-document-storage.service");
const {
  createKycSubmissionService,
} = require("./kyc-submission.service");
const {
  createKycDocumentReadService,
} = require("./kyc-document-read.service");
const {
  createKycSubmissionController,
} = require("./kyc-submission.controller");

const storageService = createKycDocumentStorageService({
  uploadFileToS3,
  deleteObjectFromS3,
  buildS3Path,
});
const kycSubmissionService = createKycSubmissionService({
  BusOwner,
  storageService,
  logger: console,
});
const kycDocumentReadService = createKycDocumentReadService({
  getPresignedUrl,
});

module.exports = createKycSubmissionController({
  BusOwner,
  storageService,
  kycDocumentReadService,
  kycSubmissionService,
});
