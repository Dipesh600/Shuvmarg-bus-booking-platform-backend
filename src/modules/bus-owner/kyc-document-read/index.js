"use strict";

const BusOwner = require("../../../../models/busOwnerModel");
const { getPresignedUrl } = require("../../../../services/s3Service");
const { createKycDocumentReadUrlService } = require("./kyc-document-read-url.service");
const { createKycDocumentReadController } = require("./kyc-document-read.controller");
const { getKycDocumentReadActor } = require("./kyc-document-read-actor");
const { assertCanReadBusOwnerKycDocument } = require("./kyc-document-read.policy");
const { resolveAuthorizedKycDocumentReference } = require("./kyc-document-reference.service");

const urlService = createKycDocumentReadUrlService({ getPresignedUrl });
const controller = createKycDocumentReadController({ BusOwner, urlService });

module.exports = {
  getKycDocumentReadUrl: controller.getKycDocumentReadUrl,
  sanitizeKycDetailDescriptors: controller.sanitizeKycDetailDescriptors,
  getKycDocumentReadActor,
  assertCanReadBusOwnerKycDocument,
  resolveAuthorizedKycDocumentReference,
  createKycDocumentReadUrlService,
  createKycDocumentReadController,
};
