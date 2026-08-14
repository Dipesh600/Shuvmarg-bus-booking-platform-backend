"use strict";

const s3Service = require("../../../../services/s3Service");
const { resolveAuthorizedAdminActor } = require("../../admin/bus-owner-management/admin-actor.resolver");
const createFleetDocumentRepository = require("./fleet-document.repository");
const { createFleetDocumentStorageService } = require("./fleet-document-storage.service");
const { resolveBusOwnerActor, resolveAdminActor } = require("./fleet-document-actor.resolver");
const createFleetDocumentUploadService = require("./fleet-document-upload.service");
const createFleetDocumentReadService = require("./fleet-document-read.service");
const createBusOwnerFleetDocumentController = require("./bus-owner-fleet-document.controller");
const createAdminFleetDocumentController = require("./admin-fleet-document.controller");
const { processValidatedUpload } = require("../../shared/security/secure-upload-processor");

const repository = createFleetDocumentRepository();
const storage = createFleetDocumentStorageService({
  uploadFileToS3: s3Service.uploadFileToS3,
  deleteObjectFromS3: s3Service.deleteObjectFromS3,
});

async function busOwnerActorResolver(context, repo) {
  return resolveBusOwnerActor(context.userInfo, repo);
}

async function adminActorResolver(context) {
  return resolveAdminActor(context.adminInfo, resolveAuthorizedAdminActor);
}

const busOwnerUploadService = createFleetDocumentUploadService({
  repository,
  storage,
  resolveActor: busOwnerActorResolver,
  processUpload: processValidatedUpload,
});

const busOwnerReadService = createFleetDocumentReadService({
  repository,
  getPresignedUrl: s3Service.getPresignedUrl,
  resolveActor: busOwnerActorResolver,
});

const adminUploadService = createFleetDocumentUploadService({
  repository,
  storage,
  resolveActor: adminActorResolver,
  processUpload: processValidatedUpload,
});

const adminReadService = createFleetDocumentReadService({
  repository,
  getPresignedUrl: s3Service.getPresignedUrl,
  fetchDocument: s3Service.getObjectFromS3,
  resolveActor: adminActorResolver,
});

const busOwnerFleetDocumentController = createBusOwnerFleetDocumentController({
  uploadService: busOwnerUploadService,
  readService: busOwnerReadService,
});

const adminFleetDocumentController = createAdminFleetDocumentController({
  uploadService: adminUploadService,
  readService: adminReadService,
});

module.exports = {
  busOwnerFleetDocumentController,
  adminFleetDocumentController,
  createFleetDocumentUploadService,
  createFleetDocumentReadService,
  repository,
  storage,
};
