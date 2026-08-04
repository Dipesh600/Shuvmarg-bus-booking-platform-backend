"use strict";

const BusOwner = require("../../../../models/busOwnerModel");
const User = require("../../../../models/userModel");
const {
  applyDocumentVerdicts,
  invalidDocuments,
} = require("../../admin/bus-owner-management/kyc-verdict.policy");
const {
  notifyKycResult,
} = require("../../admin/bus-owner-management/kyc-notification.service");
const { createKycReviewService } = require("./kyc-review.service");
const { createKycReviewController } = require("./kyc-review.controller");

const reviewService = createKycReviewService({
  BusOwner,
  User,
  applyDocumentVerdicts,
  invalidDocuments,
});

const controller = createKycReviewController({
  reviewService,
  notifyKycResult,
});

module.exports = {
  updateBusOwnerKyc: controller.updateBusOwnerKyc,
  createKycReviewService,
  createKycReviewController,
};
