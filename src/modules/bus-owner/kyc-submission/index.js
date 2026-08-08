"use strict";

const mongoose = require("mongoose");
const BusOwner = require("../../../../models/busOwnerModel");
const User = require("../../../../models/userModel");
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
const { createKycMalwareScanner } = require("./kyc-malware-scanner.service");

const storageService = createKycDocumentStorageService({
  uploadFileToS3,
  deleteObjectFromS3,
  buildS3Path,
});
const malwareScanner = createKycMalwareScanner({ logger: console });
const kycSubmissionService = createKycSubmissionService({
  BusOwner,
  User,
  mongoose,
  storageService,
  malwareScanner,
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
