"use strict";

const mongoose = require("mongoose");
const Admin = require("../../../../models/adminModel");
const BusOwner = require("../../../../models/busOwnerModel");
const User = require("../../../../models/userModel");
const OperatorBrand = require("../../../../models/operatorBrandModel");
const {
  applyDocumentVerdicts,
  invalidDocuments,
} = require("../../admin/bus-owner-management/kyc-verdict.policy");
const {
  notifyKycResult,
} = require("../../admin/bus-owner-management/kyc-notification.service");
const { createKycReviewService } = require("./kyc-review.service");
const { createKycReviewController } = require("./kyc-review.controller");
const { getKycReviewerActor, assertCanReviewBusOwnerKyc } = require("./kyc-review-actor.policy");
const { resolveKycReviewer } = require("./kyc-review-reviewer.resolver");
const { assertReviewerIsIndependent } = require("./kyc-review-separation-of-duty.policy");

const reviewService = createKycReviewService({
  Admin,
  BusOwner,
  User,
  OperatorBrand,
  applyDocumentVerdicts,
  invalidDocuments,
  mongoose,
});

const controller = createKycReviewController({
  reviewService,
  notifyKycResult,
});

module.exports = {
  updateBusOwnerKyc: controller.updateBusOwnerKyc,
  createKycReviewService,
  createKycReviewController,
  getKycReviewerActor,
  assertCanReviewBusOwnerKyc,
  resolveKycReviewer,
  assertReviewerIsIndependent,
};
