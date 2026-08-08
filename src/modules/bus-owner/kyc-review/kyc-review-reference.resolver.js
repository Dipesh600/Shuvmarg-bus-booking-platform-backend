"use strict";

const mongoose = require("mongoose");
const { KycReviewError } = require("./kyc-review.errors");

async function resolveBusOwnerForReviewReference({ id, BusOwner }) {
  if (!id || typeof id !== "string" || !mongoose.Types.ObjectId.isValid(id)) {
    throw new KycReviewError("KYC_REVIEW_INVALID_ID", "Invalid id format!", 400);
  }

  const owner = await BusOwner.findOne({
    $or: [{ _id: id }, { user: id }],
  });

  if (!owner) {
    throw new KycReviewError("KYC_REVIEW_NOT_FOUND", "Bus owner not found!", 404);
  }

  return owner;
}

module.exports = { resolveBusOwnerForReviewReference };
